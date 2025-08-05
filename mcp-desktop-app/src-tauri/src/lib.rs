mod domain;
mod infrastructure;
mod application;

use application::commands::*;
use application::state::AppState;
use tracing_subscriber::EnvFilter;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Set up panic handler
    std::panic::set_hook(Box::new(|panic_info| {
        eprintln!("Application panicked: {:?}", panic_info);
        if let Some(location) = panic_info.location() {
            eprintln!("Panic occurred in file '{}' at line {}", location.file(), location.line());
        }
    }));

    // Initialize logging
    if let Err(e) = tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::from_default_env()
                .add_directive("mcp_desktop=debug".parse().unwrap_or_else(|_| "info".parse().unwrap()))
        )
        .try_init() 
    {
        eprintln!("Failed to initialize logging: {}", e);
    }

    println!("Starting MCP Desktop Application...");

    let result = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .manage(AppState::new())
        .invoke_handler(tauri::generate_handler![
            start_mcp_server,
            discover_tools,
            get_connection_status,
            disconnect_server
        ])
        .run(tauri::generate_context!());

    if let Err(e) = result {
        eprintln!("Error running Tauri application: {}", e);
        std::process::exit(1);
    }
}
