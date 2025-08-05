use crate::domain::json_rpc::{JsonRpcId, JsonRpcMessage, JsonRpcNotification, JsonRpcRequest};
use crate::domain::mcp_types::*;
use crate::infrastructure::stdio_transport::{ServerConfig, StdioTransport};
use serde_json::json;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{oneshot, Mutex, RwLock};
use tracing::{debug, error, info};

pub struct McpClient {
    transport: Arc<Mutex<StdioTransport>>,
    pending_requests: Arc<Mutex<HashMap<String, oneshot::Sender<serde_json::Value>>>>,
    connection_status: Arc<RwLock<ConnectionStatus>>,
    server_capabilities: Arc<RwLock<Option<ServerCapabilities>>>,
    tools: Arc<RwLock<Vec<Tool>>>,
}

impl McpClient {
    pub async fn new(config: ServerConfig) -> Result<Self, Box<dyn std::error::Error>> {
        let transport = StdioTransport::new(config).await?;
        let transport = Arc::new(Mutex::new(transport));
        let pending_requests = Arc::new(Mutex::new(HashMap::new()));
        let connection_status = Arc::new(RwLock::new(ConnectionStatus::Connecting));
        let server_capabilities = Arc::new(RwLock::new(None));
        let tools = Arc::new(RwLock::new(Vec::new()));

        let client = Self {
            transport: transport.clone(),
            pending_requests: pending_requests.clone(),
            connection_status: connection_status.clone(),
            server_capabilities,
            tools: tools.clone(),
        };

        let transport_clone = transport.clone();
        let pending_clone = pending_requests.clone();
        tokio::spawn(async move {
            loop {
                let mut transport = transport_clone.lock().await;
                if let Some(message) = transport.receive().await {
                    drop(transport);
                    Self::handle_message(message, &pending_clone).await;
                } else {
                    break;
                }
            }
        });

        Ok(client)
    }

    async fn handle_message(
        message: JsonRpcMessage,
        pending_requests: &Arc<Mutex<HashMap<String, oneshot::Sender<serde_json::Value>>>>,
    ) {
        match message {
            JsonRpcMessage::Response(response) => {
                if let JsonRpcId::String(id) = &response.id {
                    let mut pending = pending_requests.lock().await;
                    if let Some(sender) = pending.remove(id) {
                        if let Some(result) = response.result {
                            let _ = sender.send(result);
                        } else if let Some(error) = response.error {
                            error!("RPC error: {:?}", error);
                        }
                    }
                }
            }
            JsonRpcMessage::Notification(notification) => {
                debug!("Received notification: {}", notification.method);
            }
            _ => {}
        }
    }

    async fn send_request(&self, method: String, params: Option<serde_json::Value>) -> Result<serde_json::Value, Box<dyn std::error::Error>> {
        let request = JsonRpcRequest::new(method.clone(), params);
        let id = if let JsonRpcId::String(ref id) = request.id {
            id.clone()
        } else {
            return Err("Invalid request ID".into());
        };

        debug!("Sending request {} with ID {}", method, id);

        let (tx, rx) = oneshot::channel();
        {
            let mut pending = self.pending_requests.lock().await;
            pending.insert(id.clone(), tx);
        }

        let transport = self.transport.lock().await;
        match transport.send(JsonRpcMessage::Request(request)).await {
            Ok(()) => debug!("Successfully sent request {} with ID {}", method, id),
            Err(e) => {
                error!("Failed to send request {} with ID {}: {}", method, id, e);
                return Err(e);
            }
        }
        drop(transport);

        // Add timeout for the response
        match tokio::time::timeout(std::time::Duration::from_secs(10), rx).await {
            Ok(Ok(result)) => {
                debug!("Received response for request {} with ID {}", method, id);
                Ok(result)
            }
            Ok(Err(e)) => {
                error!("Channel error for request {} with ID {}: {}", method, id, e);
                Err(e.into())
            }
            Err(_) => {
                error!("Timeout waiting for response to request {} with ID {}", method, id);
                // Clean up pending request
                let mut pending = self.pending_requests.lock().await;
                pending.remove(&id);
                Err("Request timeout".into())
            }
        }
    }

    async fn send_notification(&self, method: String, params: Option<serde_json::Value>) -> Result<(), Box<dyn std::error::Error>> {
        let notification = JsonRpcNotification::new(method, params);
        let transport = self.transport.lock().await;
        transport.send(JsonRpcMessage::Notification(notification)).await?;
        Ok(())
    }

    pub async fn initialize(&self) -> Result<(), Box<dyn std::error::Error>> {
        info!("Initializing MCP connection");
        
        let init_params = InitializeRequest {
            protocol_version: "2025-06-18".to_string(),
            capabilities: ClientCapabilities {
                tools: Some(ToolsCapability { list: true }),
                prompts: Some(PromptsCapability { list: true }),
                resources: Some(ResourcesCapability { list: true }),
            },
            client_info: ClientInfo {
                name: "MCP Desktop App".to_string(),
                version: "0.1.0".to_string(),
            },
        };

        debug!("Sending initialize request: {:?}", init_params);
        
        let response = match self.send_request("initialize".to_string(), Some(json!(init_params))).await {
            Ok(response) => {
                debug!("Received initialize response: {:?}", response);
                response
            }
            Err(e) => {
                error!("Failed to send initialize request: {}", e);
                return Err(e);
            }
        };
        
        let init_response: InitializeResponse = match serde_json::from_value(response) {
            Ok(response) => response,
            Err(e) => {
                error!("Failed to parse initialize response: {}", e);
                return Err(e.into());
            }
        };
        
        info!("Server info: {} v{}", init_response.server_info.name, init_response.server_info.version);
        
        {
            let mut caps = self.server_capabilities.write().await;
            *caps = Some(init_response.capabilities);
        }

        self.send_notification("initialized".to_string(), None).await?;
        
        {
            let mut status = self.connection_status.write().await;
            *status = ConnectionStatus::Connected;
        }
        
        info!("MCP connection initialized successfully");
        Ok(())
    }

    pub async fn discover_tools(&self) -> Result<Vec<Tool>, Box<dyn std::error::Error>> {
        info!("Discovering available tools");
        
        let caps = self.server_capabilities.read().await;
        if let Some(ref capabilities) = *caps {
            if capabilities.tools.is_none() || !capabilities.tools.as_ref().unwrap().list {
                return Ok(Vec::new());
            }
        } else {
            return Err("Server not initialized".into());
        }
        drop(caps);

        let response = self.send_request("tools/list".to_string(), None).await?;
        let tools_response: ListToolsResponse = serde_json::from_value(response)?;
        
        {
            let mut tools = self.tools.write().await;
            *tools = tools_response.tools.clone();
        }
        
        info!("Discovered {} tools", tools_response.tools.len());
        for tool in &tools_response.tools {
            debug!("Tool: {} - {:?}", tool.name, tool.description);
        }
        
        Ok(tools_response.tools)
    }

    pub async fn get_connection_status(&self) -> ConnectionStatus {
        self.connection_status.read().await.clone()
    }

    pub async fn shutdown(self) -> Result<(), Box<dyn std::error::Error>> {
        {
            let mut status = self.connection_status.write().await;
            *status = ConnectionStatus::Disconnected;
        }
        
        let transport = Arc::try_unwrap(self.transport)
            .map_err(|_| "Failed to unwrap transport")?
            .into_inner();
        transport.shutdown().await?;
        Ok(())
    }
}