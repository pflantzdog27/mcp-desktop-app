# MCP Desktop Client

A powerful desktop application that provides intelligent conversational access to ServiceNow through the Model Context Protocol (MCP), enhanced with OpenAI GPT-4 for natural language processing.

![MCP Desktop Client](https://img.shields.io/badge/Platform-macOS%20%7C%20Windows%20%7C%20Linux-blue)
![Tauri](https://img.shields.io/badge/Tauri-1.x-orange)
![React](https://img.shields.io/badge/React-18.x-blue)
![Rust](https://img.shields.io/badge/Rust-1.70+-red)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)

## ✨ Features

### 🧠 AI-Powered Tool Selection
- **GPT-4 Integration**: Intelligent analysis of natural language requests
- **Smart Tool Mapping**: Automatically selects the best ServiceNow tool from 28+ available options
- **Context Understanding**: Processes complex queries with multiple parameters

### 🛠️ ServiceNow Integration
- **28+ Administrative Tools**: Complete coverage of ServiceNow operations
- **Real-time Execution**: Direct tool execution with live status updates
- **MCP Protocol**: Standards-based integration through Model Context Protocol

### 💬 Natural Language Interface
- **Conversational UI**: Chat-based interface for intuitive interactions
- **Smart Responses**: GPT-4 processes raw API responses into human-friendly answers
- **Process Visibility**: See the AI's reasoning and tool selection in real-time

## 🚀 Quick Start

### Prerequisites
- **Node.js** 18+ and npm
- **Rust** 1.70+ and Cargo
- **ServiceNow MCP Server** (configured and running)
- **OpenAI API Key** with GPT-4 access

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/pflantzdog27/mcp-desktop-app.git
   cd mcp-desktop-app
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure OpenAI API Key**
   Edit `src/services/llm.ts` and add your OpenAI API key:
   ```typescript
   const openai = new OpenAI({
     apiKey: 'your-openai-api-key-here',
     dangerouslyAllowBrowser: true
   });
   ```

4. **Start ServiceNow MCP Server**
   ```bash
   # In a separate terminal
   cd /path/to/your/servicenow-mcp-server
   DEBUG=* npm start
   ```

5. **Build and run the application**
   ```bash
   npm run tauri dev    # Development mode
   npm run tauri build  # Production build
   ```

## 🎯 Usage Examples

### Basic Operations
```
"Test connection to ServiceNow"
"Create a new incident for email server outage"
"Show me all active problems"
```

### Complex Queries
```
"How many high priority incidents are assigned to the network team?"
"Create a flow in Flow Designer for automatic ticket routing"
"Find all change requests scheduled for this weekend with approval pending"
```

### ServiceNow Administration
```
"Create a catalog item for laptop requests"
"Set up a business rule for incident auto-assignment"
"Create a UI policy to hide fields based on category"
```

## 🏗️ Architecture

### Frontend (React + TypeScript)
- **Chat Interface**: Conversational UI for user interactions
- **Tool Visualization**: Dynamic display of available ServiceNow tools
- **Connection Management**: Real-time connection status and controls
- **LLM Integration**: OpenAI GPT-4 service for intelligent processing

### Backend (Rust + Tauri)
- **MCP Client**: Standards-compliant Model Context Protocol implementation
- **Tool Execution**: Secure invocation of ServiceNow operations
- **Connection Pooling**: Efficient management of ServiceNow connections
- **Error Handling**: Comprehensive error recovery and user feedback

### AI Integration
- **Tool Selection**: GPT-4 analyzes requests and selects optimal tools
- **Argument Extraction**: Smart parameter extraction from natural language
- **Response Processing**: Converts raw API responses to natural language

## 🛡️ Security

- **API Key Protection**: OpenAI keys handled securely in desktop environment
- **ServiceNow Authentication**: Credentials managed by separate MCP server
- **Sandboxed Execution**: Tauri provides OS-level security boundaries
- **No Data Persistence**: Chat history and sensitive data not stored locally

## 🔧 Configuration

### ServiceNow MCP Server Path
Update the server path in `src/App.tsx`:
```typescript
cwd: '/path/to/your/servicenow-mcp-consultancy'
```

### Available Tools
The application automatically discovers tools from your ServiceNow MCP server:
- Incident management
- Problem resolution
- Change requests
- Catalog items
- Business rules
- UI policies
- Flow Designer
- And 20+ more administrative tools

## 🚨 Troubleshooting

### Common Issues

**"Connection failed after 3 attempts"**
- Ensure ServiceNow MCP server is running
- Check server path configuration
- Verify ServiceNow credentials

**"No tools available"**
- Confirm MCP server supports tool listing
- Check server initialization logs
- Verify MCP protocol compatibility

**"LLM tool selection failed"**
- Validate OpenAI API key
- Check network connectivity
- Verify GPT-4 access permissions

### Debug Mode
```bash
RUST_LOG=debug npm run tauri dev
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines
- Follow TypeScript strict mode
- Use Rust standard formatting
- Add comprehensive error handling
- Test with real ServiceNow instances
- Document new features in CLAUDE.md

## 📋 Requirements

### System Requirements
- **macOS** 10.15+ / **Windows** 10+ / **Linux** (Ubuntu 18.04+)
- **Memory**: 4GB RAM minimum, 8GB recommended
- **Disk Space**: 200MB for application, additional space for logs

### ServiceNow Requirements
- ServiceNow instance with admin access
- ServiceNow MCP server configured and running
- Network connectivity to ServiceNow instance

### API Requirements
- OpenAI API key with GPT-4 access
- Sufficient API credits for usage patterns

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **Anthropic** for Claude Code development assistance
- **OpenAI** for GPT-4 language model capabilities
- **Tauri Team** for the excellent desktop application framework
- **ServiceNow** for the comprehensive platform APIs
- **MCP Community** for the Model Context Protocol standards

## 📞 Support

- **Issues**: Report bugs and feature requests via [GitHub Issues](https://github.com/pflantzdog27/mcp-desktop-app/issues)
- **Documentation**: Detailed technical documentation in [CLAUDE.md](CLAUDE.md)
- **Discussions**: Community discussions via [GitHub Discussions](https://github.com/pflantzdog27/mcp-desktop-app/discussions)

---

**Built with ❤️ using Tauri, React, Rust, and OpenAI GPT-4**
