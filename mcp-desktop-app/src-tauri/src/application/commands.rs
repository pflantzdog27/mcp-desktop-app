use crate::application::state::AppState;
use crate::domain::mcp_types::Tool;
use crate::infrastructure::proper_mcp_client::ClientState;
use crate::infrastructure::mcp_transport::ServerConfig;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tauri::State;
use tracing::{error, info};

#[derive(Debug, Serialize, Deserialize)]
pub struct StartServerRequest {
    pub command: String,
    pub args: Vec<String>,
    pub cwd: Option<String>,
    pub env: Option<HashMap<String, String>>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ConnectionStatusResponse {
    pub status: String,
    pub message: Option<String>,
}

#[tauri::command]
pub async fn start_mcp_server(
    request: StartServerRequest,
    state: State<'_, AppState>,
) -> Result<String, String> {
    info!("Starting MCP server: {} {:?}", request.command, request.args);
    
    // Create server config
    let config = ServerConfig {
        command: request.command.clone(),
        args: request.args.clone(),
        cwd: request.cwd.clone(),
        env: request.env.clone(),
    };

    let mut client = state.mcp_client.lock().await;
    
    match client.connect(config).await {
        Ok(()) => {
            info!("MCP server started successfully");
            Ok("Server started successfully".to_string())
        }
        Err(e) => {
            error!("Failed to connect to MCP server: {}", e);
            Err(format!("Failed to connect: {}", e))
        }
    }
}

#[tauri::command]
pub async fn discover_tools(state: State<'_, AppState>) -> Result<Vec<Tool>, String> {
    info!("Discovering tools");
    
    let client = state.mcp_client.lock().await;
    match client.list_tools().await {
        Ok(tools) => Ok(tools),
        Err(e) => {
            error!("Failed to discover tools: {}", e);
            Err(format!("Failed to discover tools: {}", e))
        }
    }
}

#[tauri::command]
pub async fn get_connection_status(state: State<'_, AppState>) -> Result<ConnectionStatusResponse, String> {
    let client = state.mcp_client.lock().await;
    let client_state = client.get_state().await;
    
    let (status_str, message) = match client_state {
        ClientState::Disconnected => ("disconnected", None),
        ClientState::Connecting => ("connecting", None),
        ClientState::Connected => ("connected", None),
        ClientState::Error(msg) => ("error", Some(msg)),
    };
    
    Ok(ConnectionStatusResponse {
        status: status_str.to_string(),
        message,
    })
}

#[tauri::command]
pub async fn disconnect_server(state: State<'_, AppState>) -> Result<String, String> {
    info!("Disconnecting from MCP server");
    
    let mut client = state.mcp_client.lock().await;
    match client.disconnect().await {
        Ok(()) => Ok("Disconnected successfully".to_string()),
        Err(e) => {
            error!("Error during disconnect: {}", e);
            Err(format!("Failed to disconnect cleanly: {}", e))
        }
    }
}