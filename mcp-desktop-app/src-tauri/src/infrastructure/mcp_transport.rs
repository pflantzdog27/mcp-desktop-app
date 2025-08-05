use async_trait::async_trait;
use serde_json::Value;
use std::collections::HashMap;
use std::process::Stdio;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader, BufWriter};
use tokio::process::{Child, Command};
use tokio::sync::{mpsc, oneshot};
use tracing::{debug, error, info, warn};
use uuid::Uuid;

use crate::domain::json_rpc::{JsonRpcMessage, JsonRpcRequest, JsonRpcResponse, JsonRpcId};

#[derive(Debug, thiserror::Error)]
pub enum TransportError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("Channel closed")]
    ChannelClosed,
    #[error("Request timeout")]
    Timeout,
    #[error("Process error: {0}")]
    Process(String),
}

#[async_trait]
pub trait Transport: Send + Sync {
    async fn send_request(&self, method: &str, params: Option<Value>) -> Result<Value, TransportError>;
    async fn send_notification(&self, method: &str, params: Option<Value>) -> Result<(), TransportError>;
    async fn close(&mut self) -> Result<(), TransportError>;
}

pub struct StdioTransport {
    child: Option<Child>,
    stdin_tx: mpsc::UnboundedSender<JsonRpcMessage>,
    pending_requests: mpsc::UnboundedSender<(String, oneshot::Sender<Result<Value, TransportError>>)>,
    _handles: Vec<tokio::task::JoinHandle<()>>,
}

pub struct ServerConfig {
    pub command: String,
    pub args: Vec<String>,
    pub cwd: Option<String>,
    pub env: Option<HashMap<String, String>>,
}

impl StdioTransport {
    pub async fn new(config: ServerConfig) -> Result<Self, TransportError> {
        info!("Starting MCP server: {} {:?}", config.command, config.args);
        
        let mut cmd = Command::new(&config.command);
        cmd.args(&config.args)
           .stdin(Stdio::piped())
           .stdout(Stdio::piped())
           .stderr(Stdio::piped())
           .kill_on_drop(true);
        
        if let Some(ref cwd) = config.cwd {
            cmd.current_dir(cwd);
            info!("Working directory: {}", cwd);
        }
        
        if let Some(env) = config.env {
            for (key, value) in env {
                cmd.env(key, value);
            }
        }
        
        info!("Attempting to spawn process with command: {} {:?}", config.command, config.args);
        if let Some(ref cwd) = config.cwd {
            info!("Process working directory: {}", cwd);
        }
        
        let mut child = match cmd.spawn() {
            Ok(child) => {
                info!("Successfully spawned MCP server process with PID: {:?}", child.id());
                child
            }
            Err(e) => {
                error!("Failed to spawn process: {} - Command: {} {:?}", e, config.command, config.args);
                return Err(TransportError::Io(e));
            }
        };
        
        let stdin = child.stdin.take().ok_or_else(|| {
            TransportError::Process("Failed to get stdin".into())
        })?;
        let stdout = child.stdout.take().ok_or_else(|| {
            TransportError::Process("Failed to get stdout".into())
        })?;
        let stderr = child.stderr.take().ok_or_else(|| {
            TransportError::Process("Failed to get stderr".into())
        })?;
        
        let (stdin_tx, mut stdin_rx) = mpsc::unbounded_channel::<JsonRpcMessage>();
        let (pending_tx, mut pending_rx) = mpsc::unbounded_channel::<(String, oneshot::Sender<Result<Value, TransportError>>)>();
        let (response_tx, mut response_rx) = mpsc::unbounded_channel::<JsonRpcResponse>();
        
        let mut pending_requests = HashMap::<String, oneshot::Sender<Result<Value, TransportError>>>::new();
        
        // Handle pending requests and responses
        let pending_handle = tokio::spawn(async move {
            loop {
                tokio::select! {
                    // New pending request
                    Some((id, sender)) = pending_rx.recv() => {
                        pending_requests.insert(id, sender);
                    }
                    // Response received
                    Some(response) = response_rx.recv() => {
                        if let JsonRpcId::String(id) = response.id {
                            if let Some(sender) = pending_requests.remove(&id) {
                                let result = if let Some(result) = response.result {
                                    Ok(result)
                                } else if let Some(error) = response.error {
                                    Err(TransportError::Process(format!("RPC error {}: {}", error.code, error.message)))
                                } else {
                                    Err(TransportError::Process("Invalid response".into()))
                                };
                                let _ = sender.send(result);
                            }
                        }
                    }
                    else => break,
                }
            }
        });
        
        // Stdin writer
        let stdin_handle = tokio::spawn(async move {
            let mut writer = BufWriter::new(stdin);
            
            while let Some(message) = stdin_rx.recv().await {
                match serde_json::to_string(&message) {
                    Ok(json) => {
                        debug!("Sending: {}", json);
                        if let Err(e) = writer.write_all(json.as_bytes()).await {
                            error!("Failed to write to stdin: {}", e);
                            break;
                        }
                        if let Err(e) = writer.write_all(b"\n").await {
                            error!("Failed to write newline: {}", e);
                            break;
                        }
                        if let Err(e) = writer.flush().await {
                            error!("Failed to flush stdin: {}", e);
                            break;
                        }
                    }
                    Err(e) => {
                        error!("Failed to serialize message: {}", e);
                    }
                }
            }
        });
        
        // Stdout reader
        let stdout_handle = tokio::spawn(async move {
            let reader = BufReader::new(stdout);
            let mut lines = reader.lines();
            
            while let Ok(Some(line)) = lines.next_line().await {
                if line.trim().is_empty() {
                    continue;
                }
                
                debug!("Received: {}", line);
                
                match serde_json::from_str::<JsonRpcMessage>(&line) {
                    Ok(JsonRpcMessage::Response(response)) => {
                        info!("Received response for request ID: {:?}", response.id);
                        if response_tx.send(response).is_err() {
                            error!("Failed to send response to handler");
                            break;
                        }
                    }
                    Ok(JsonRpcMessage::Notification(notification)) => {
                        info!("Received notification: {} with params: {:?}", notification.method, notification.params);
                    }
                    Ok(JsonRpcMessage::Request(request)) => {
                        warn!("Received unexpected request from server: {} with ID: {:?}", request.method, request.id);
                    }
                    Err(e) => {
                        error!("Failed to parse JSON-RPC message: {} - Raw line: {}", e, line);
                    }
                }
            }
        });
        
        // Stderr reader
        let stderr_handle = tokio::spawn(async move {
            let reader = BufReader::new(stderr);
            let mut lines = reader.lines();
            
            while let Ok(Some(line)) = lines.next_line().await {
                if !line.trim().is_empty() {
                    info!("Server stderr: {}", line);
                }
            }
        });
        
        Ok(Self {
            child: Some(child),
            stdin_tx,
            pending_requests: pending_tx,
            _handles: vec![pending_handle, stdin_handle, stdout_handle, stderr_handle],
        })
    }
}

#[async_trait]
impl Transport for StdioTransport {
    async fn send_request(&self, method: &str, params: Option<Value>) -> Result<Value, TransportError> {
        let id = Uuid::new_v4().to_string();
        let request = JsonRpcRequest {
            jsonrpc: "2.0".to_string(),
            method: method.to_string(),
            params,
            id: JsonRpcId::String(id.clone()),
        };
        
        let (tx, rx) = oneshot::channel();
        
        // Register pending request
        self.pending_requests.send((id.clone(), tx))
            .map_err(|_| TransportError::ChannelClosed)?;
        
        // Send request
        self.stdin_tx.send(JsonRpcMessage::Request(request))
            .map_err(|_| TransportError::ChannelClosed)?;
        
        // Wait for response with timeout
        match tokio::time::timeout(std::time::Duration::from_secs(30), rx).await {
            Ok(Ok(result)) => result,
            Ok(Err(_)) => Err(TransportError::ChannelClosed),
            Err(_) => Err(TransportError::Timeout),
        }
    }
    
    async fn send_notification(&self, method: &str, params: Option<Value>) -> Result<(), TransportError> {
        let notification = crate::domain::json_rpc::JsonRpcNotification {
            jsonrpc: "2.0".to_string(),
            method: method.to_string(),
            params,
        };
        
        self.stdin_tx.send(JsonRpcMessage::Notification(notification))
            .map_err(|_| TransportError::ChannelClosed)?;
        
        Ok(())
    }
    
    async fn close(&mut self) -> Result<(), TransportError> {
        if let Some(mut child) = self.child.take() {
            let _ = child.kill().await;
            let _ = child.wait().await;
        }
        Ok(())
    }
}