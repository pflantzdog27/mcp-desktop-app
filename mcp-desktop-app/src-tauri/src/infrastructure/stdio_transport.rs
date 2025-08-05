use crate::domain::json_rpc::JsonRpcMessage;
use std::collections::HashMap;
use std::process::Stdio;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::mpsc;
use tracing::{debug, error, info};

pub struct StdioTransport {
    process: Child,
    tx: mpsc::Sender<JsonRpcMessage>,
    rx: mpsc::Receiver<JsonRpcMessage>,
}

pub struct ServerConfig {
    pub command: String,
    pub args: Vec<String>,
    pub cwd: Option<String>,
    pub env: Option<HashMap<String, String>>,
}

impl StdioTransport {
    pub async fn new(config: ServerConfig) -> Result<Self, Box<dyn std::error::Error>> {
        info!("Starting MCP server: {} {:?}", config.command, config.args);
        if let Some(ref cwd) = config.cwd {
            info!("Working directory: {}", cwd);
        }
        
        let mut cmd = Command::new(&config.command);
        cmd.args(&config.args)
           .stdin(Stdio::piped())
           .stdout(Stdio::piped())
           .stderr(Stdio::piped());
        
        // Set working directory if provided
        if let Some(cwd) = config.cwd {
            cmd.current_dir(cwd);
        }
        
        // Set environment variables if provided
        if let Some(env) = config.env {
            for (key, value) in env {
                cmd.env(key, value);
            }
        }
        
        let mut child = match cmd.spawn() {
            Ok(child) => {
                info!("Successfully spawned MCP server process");
                child
            }
            Err(e) => {
                error!("Failed to spawn MCP server process: {}", e);
                return Err(e.into());
            }
        };

        let (tx, rx) = mpsc::channel(100);
        let (internal_tx, mut internal_rx) = mpsc::channel(100);

        let stdout = child.stdout.take().expect("Failed to get stdout");
        let stdin = child.stdin.take().expect("Failed to get stdin");
        let stderr = child.stderr.take().expect("Failed to get stderr");

        let tx_clone = tx.clone();
        tokio::spawn(async move {
            let reader = BufReader::new(stdout);
            let mut lines = reader.lines();
            
            while let Ok(Some(line)) = lines.next_line().await {
                debug!("Received from server: {}", line);
                
                if line.trim().is_empty() {
                    continue;
                }
                
                match serde_json::from_str::<JsonRpcMessage>(&line) {
                    Ok(message) => {
                        debug!("Parsed JSON-RPC message: {:?}", message);
                        if tx_clone.send(message).await.is_err() {
                            error!("Failed to send message to channel");
                            break;
                        }
                    }
                    Err(e) => {
                        error!("Failed to parse JSON-RPC message '{}': {}", line, e);
                    }
                }
            }
            debug!("Stdout reader task ended");
        });

        tokio::spawn(async move {
            let reader = BufReader::new(stderr);
            let mut lines = reader.lines();
            
            while let Ok(Some(line)) = lines.next_line().await {
                error!("Server stderr: {}", line);
            }
        });

        let mut stdin = stdin;
        tokio::spawn(async move {
            while let Some(message) = internal_rx.recv().await {
                let json = serde_json::to_string(&message).unwrap();
                debug!("Sending to server: {}", json);
                
                if let Err(e) = stdin.write_all(json.as_bytes()).await {
                    error!("Failed to write to stdin: {}", e);
                    break;
                }
                
                if let Err(e) = stdin.write_all(b"\n").await {
                    error!("Failed to write newline: {}", e);
                    break;
                }
                
                if let Err(e) = stdin.flush().await {
                    error!("Failed to flush stdin: {}", e);
                    break;
                }
            }
        });

        Ok(Self {
            process: child,
            tx: internal_tx,
            rx,
        })
    }

    pub async fn send(&self, message: JsonRpcMessage) -> Result<(), Box<dyn std::error::Error>> {
        self.tx.send(message).await?;
        Ok(())
    }

    pub async fn receive(&mut self) -> Option<JsonRpcMessage> {
        self.rx.recv().await
    }

    pub async fn shutdown(mut self) -> Result<(), Box<dyn std::error::Error>> {
        info!("Shutting down MCP server");
        self.process.kill().await?;
        Ok(())
    }
}