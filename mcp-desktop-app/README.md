# MCP Desktop App

A Tauri-based desktop application that acts as an MCP (Model Context Protocol) client, providing a ChatGPT/Claude-like interface for interacting with MCP servers.

## Features

- Connect to MCP servers via stdio transport
- JSON-RPC 2.0 message handling with detailed logging
- Tool discovery and display
- Clean chat interface
- Connection status monitoring
- Modular architecture for easy extension

## Prerequisites

- Node.js and npm
- Rust toolchain
- Tauri dependencies for your OS

## Setup

1. Install dependencies:
```bash
npm install
```

2. Run in development mode:
```bash
npm run tauri dev
```

3. Build for production:
```bash
npm run tauri build
```

## Usage

1. Click "Connect to Filesystem Server" to connect to the test MCP server
2. The app will discover and display available tools in the sidebar
3. Send messages in the chat interface to see the available tools
4. The connection status indicator shows the current state

## Architecture

- **Frontend**: React + TypeScript with a clean chat interface
- **Backend**: Rust with clean architecture pattern
  - Domain layer: MCP types and JSON-RPC structures
  - Infrastructure layer: MCP client and stdio transport
  - Application layer: Tauri commands and state management

## Testing

The app is configured to connect to the filesystem MCP server by default:
```bash
npx -y @modelcontextprotocol/server-filesystem /tmp
```

## Next Steps

- LLM integration for natural language processing
- Tool execution functionality
- Support for multiple MCP server connections
- Enhanced error handling and recovery
- Persistent chat history
