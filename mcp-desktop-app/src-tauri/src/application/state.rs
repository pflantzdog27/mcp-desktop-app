use crate::infrastructure::proper_mcp_client::ProperMcpClient;
use std::sync::Arc;
use tokio::sync::Mutex;

pub struct AppState {
    pub mcp_client: Arc<Mutex<ProperMcpClient>>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            mcp_client: Arc::new(Mutex::new(ProperMcpClient::new())),
        }
    }
}