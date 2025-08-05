use crate::domain::mcp_types::*;
use crate::infrastructure::mcp_transport::{ServerConfig, StdioTransport, Transport, TransportError};
use serde_json::{json, Value};
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{debug, error, info};

#[derive(Debug, thiserror::Error)]
pub enum McpClientError {
    #[error("Transport error: {0}")]
    Transport(#[from] TransportError),
    #[error("Protocol error: {0}")]
    Protocol(String),
    #[error("Not connected")]
    NotConnected,
    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),
}

#[derive(Debug, Clone, PartialEq)]
pub enum ClientState {
    Disconnected,
    Connecting,
    Connected,
    Error(String),
}

pub struct ProperMcpClient {
    transport: Option<Box<dyn Transport>>,
    state: Arc<RwLock<ClientState>>,
    server_capabilities: Arc<RwLock<Option<ServerCapabilities>>>,
    tools: Arc<RwLock<Vec<Tool>>>,
}

impl ProperMcpClient {
    pub fn new() -> Self {
        Self {
            transport: None,
            state: Arc::new(RwLock::new(ClientState::Disconnected)),
            server_capabilities: Arc::new(RwLock::new(None)),
            tools: Arc::new(RwLock::new(Vec::new())),
        }
    }
    
    pub async fn connect(&mut self, config: ServerConfig) -> Result<(), McpClientError> {
        info!("========================================");
        info!("Starting MCP connection process");
        info!("Command: {}", config.command);
        info!("Args: {:?}", config.args);
        if let Some(ref cwd) = config.cwd {
            info!("Working directory: {}", cwd);
        }
        if let Some(ref env) = config.env {
            info!("Environment variables: {:?}", env);
        }
        info!("========================================");
        
        // Update state
        {
            let mut state = self.state.write().await;
            *state = ClientState::Connecting;
        }
        
        // Create transport
        info!("Creating StdioTransport...");
        let transport = match StdioTransport::new(config).await {
            Ok(t) => {
                info!("StdioTransport created successfully");
                t
            }
            Err(e) => {
                error!("Failed to create StdioTransport: {:?}", e);
                let mut state = self.state.write().await;
                *state = ClientState::Error(format!("Transport error: {}", e));
                return Err(McpClientError::Transport(e));
            }
        };
        self.transport = Some(Box::new(transport));
        
        // Initialize the connection
        info!("Starting initialization sequence...");
        match self.initialize().await {
            Ok(()) => {
                info!("========================================");
                info!("MCP CONNECTION ESTABLISHED SUCCESSFULLY");
                info!("========================================");
                Ok(())
            }
            Err(e) => {
                error!("Initialization failed: {:?}", e);
                let mut state = self.state.write().await;
                *state = ClientState::Error(format!("Initialization failed: {}", e));
                Err(e)
            }
        }
    }
    
    async fn initialize(&mut self) -> Result<(), McpClientError> {
        let transport = self.transport.as_ref()
            .ok_or(McpClientError::NotConnected)?;
        
        info!("Initializing MCP connection");
        
        // Prepare initialization request
        let init_request = InitializeRequest {
            protocol_version: "2024-11-05".to_string(), // Use latest stable version
            capabilities: ClientCapabilities {
                tools: Some(ToolsCapability { list: true }),
                prompts: Some(PromptsCapability { list: true }),
                resources: Some(ResourcesCapability { list: true }),
            },
            client_info: ClientInfo {
                name: "MCP Desktop Client".to_string(),
                version: "0.1.0".to_string(),
            },
        };
        
        debug!("Sending initialize request: {:?}", init_request);
        
        // Send initialize request
        info!("Sending initialize request:");
        info!("  Protocol version: {}", init_request.protocol_version);
        info!("  Client: {} v{}", init_request.client_info.name, init_request.client_info.version);
        info!("  Full request: {}", serde_json::to_string_pretty(&json!(init_request)).unwrap_or_default());
        
        let response = match transport.send_request("initialize", Some(json!(init_request))).await {
            Ok(response) => {
                info!("✓ Received initialize response");
                info!("Response JSON: {}", serde_json::to_string_pretty(&response).unwrap_or_default());
                response
            }
            Err(e) => {
                error!("✗ Failed to send initialize request: {:?}", e);
                return Err(McpClientError::Transport(e));
            }
        };
        
        // Parse response
        let init_response: InitializeResponse = serde_json::from_value(response)
            .map_err(|e| McpClientError::Protocol(format!("Invalid initialize response: {}", e)))?;
        
        info!("Server: {} v{}", init_response.server_info.name, init_response.server_info.version);
        info!("Protocol version: {}", init_response.protocol_version);
        
        // Store server capabilities
        {
            let mut capabilities = self.server_capabilities.write().await;
            *capabilities = Some(init_response.capabilities);
        }
        
        // Send initialized notification
        info!("Sending 'initialized' notification...");
        match transport.send_notification("initialized", None).await {
            Ok(()) => info!("✓ 'initialized' notification sent"),
            Err(e) => {
                error!("✗ Failed to send 'initialized' notification: {:?}", e);
                return Err(McpClientError::Transport(e));
            }
        }
        
        // Update state to connected
        {
            let mut state = self.state.write().await;
            *state = ClientState::Connected;
        }
        
        info!("✓ MCP connection initialized successfully");
        info!("Client state updated to: Connected");
        Ok(())
    }
    
    pub async fn list_tools(&self) -> Result<Vec<Tool>, McpClientError> {
        info!("========================================");
        info!("Starting tool discovery process");
        
        let transport = self.transport.as_ref()
            .ok_or(McpClientError::NotConnected)?;
        
        // Check if server supports tools
        {
            let capabilities = self.server_capabilities.read().await;
            if let Some(ref caps) = *capabilities {
                info!("Server capabilities: {:?}", caps);
                if caps.tools.is_none() {
                    info!("Server does not support tools - returning empty list");
                    return Ok(Vec::new());
                }
                info!("✓ Server supports tools");
            } else {
                error!("Server not initialized - no capabilities available");
                return Err(McpClientError::Protocol("Server not initialized".into()));
            }
        }
        
        info!("Sending tools/list request...");
        
        // Send tools/list request
        let response = match transport.send_request("tools/list", None).await {
            Ok(response) => {
                info!("✓ Received tools/list response");
                info!("Response JSON: {}", serde_json::to_string_pretty(&response).unwrap_or_default());
                response
            }
            Err(e) => {
                error!("✗ Failed to send tools/list request: {:?}", e);
                return Err(McpClientError::Transport(e));
            }
        };
        
        // Parse response
        let tools_response: ListToolsResponse = serde_json::from_value(response)
            .map_err(|e| {
                error!("✗ Failed to parse tools/list response: {}", e);
                McpClientError::Protocol(format!("Invalid tools/list response: {}", e))
            })?;
        
        info!("✓ Successfully discovered {} tools", tools_response.tools.len());
        for (i, tool) in tools_response.tools.iter().enumerate() {
            info!("  Tool {}: {}", i + 1, tool.name);
            if let Some(ref desc) = tool.description {
                info!("    Description: {}", desc);
            }
            info!("    Input schema: {:?}", tool.input_schema);
        }
        
        // Store tools
        {
            let mut tools = self.tools.write().await;
            *tools = tools_response.tools.clone();
        }
        
        info!("========================================");
        Ok(tools_response.tools)
    }
    
    pub async fn call_tool(&self, name: &str, arguments: Option<Value>) -> Result<CallToolResponse, McpClientError> {
        let transport = self.transport.as_ref()
            .ok_or(McpClientError::NotConnected)?;
        
        info!("Calling tool: {}", name);
        
        let request = CallToolRequest {
            name: name.to_string(),
            arguments,
        };
        
        let response = transport.send_request("tools/call", Some(json!(request))).await?;
        
        let tool_response: CallToolResponse = serde_json::from_value(response)
            .map_err(|e| McpClientError::Protocol(format!("Invalid tools/call response: {}", e)))?;
        
        Ok(tool_response)
    }
    
    pub async fn get_state(&self) -> ClientState {
        self.state.read().await.clone()
    }
    
    pub async fn get_tools(&self) -> Vec<Tool> {
        self.tools.read().await.clone()
    }
    
    pub async fn disconnect(&mut self) -> Result<(), McpClientError> {
        if let Some(mut transport) = self.transport.take() {
            transport.close().await?;
        }
        
        {
            let mut state = self.state.write().await;
            *state = ClientState::Disconnected;
        }
        
        {
            let mut tools = self.tools.write().await;
            tools.clear();
        }
        
        {
            let mut capabilities = self.server_capabilities.write().await;
            *capabilities = None;
        }
        
        info!("Disconnected from MCP server");
        Ok(())
    }
}