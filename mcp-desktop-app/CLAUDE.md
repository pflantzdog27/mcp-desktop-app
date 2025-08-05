# MCP Desktop Client - Development Documentation

## Project Overview

The MCP Desktop Client is a sophisticated desktop application built with Tauri (Rust + React) that provides a conversational interface to ServiceNow through the Model Context Protocol (MCP). The application integrates OpenAI GPT-4 for intelligent natural language processing and tool selection.

## Architecture

### Technology Stack
- **Frontend**: React + TypeScript + Vite
- **Backend**: Rust + Tauri
- **AI**: OpenAI GPT-4 for natural language processing
- **Protocol**: Model Context Protocol (MCP) for ServiceNow integration
- **Transport**: JSON-RPC over stdio

### Core Components

#### Frontend (React)
- `src/App.tsx` - Main application component with connection management and LLM integration
- `src/components/ChatInterface.tsx` - Chat UI for user interactions
- `src/components/ToolsList.tsx` - Display of available ServiceNow tools
- `src/components/ConnectionStatus.tsx` - Connection status indicator
- `src/services/llm.ts` - OpenAI GPT-4 integration service
- `src/types/mcp.ts` - TypeScript definitions for MCP protocol

#### Backend (Rust)
- `src-tauri/src/lib.rs` - Main entry point and Tauri setup
- `src-tauri/src/application/commands.rs` - Tauri commands for MCP operations
- `src-tauri/src/infrastructure/proper_mcp_client.rs` - MCP client implementation
- `src-tauri/src/domain/mcp_types.rs` - Rust types for MCP protocol

## Key Features

### 1. Intelligent Tool Selection
The application uses GPT-4 to analyze natural language requests and select the appropriate ServiceNow tool from 28+ available options. The LLM considers:
- Tool descriptions and capabilities
- Required parameters and schemas
- Context of the user's request
- ServiceNow best practices

### 2. Smart Argument Extraction
GPT-4 extracts structured arguments from natural language:
```typescript
// Example: "Find all high priority incidents assigned to John"
{
  toolName: "query-records",
  arguments: {
    table: "incident",
    query: "priority=1^assigned_to.name=John^active=true",
    limit: 50
  }
}
```

### 3. Natural Language Response Processing
Raw ServiceNow API responses are processed by GPT-4 to provide human-friendly answers:
- Counts and summaries instead of raw data dumps
- Contextual explanations
- Actionable insights

### 4. Real-time Process Visibility
Users can see the AI's decision-making process:
1. **Analysis Phase**: "🧠 Using AI to analyze your request..."
2. **Tool Selection**: Shows selected tool and reasoning
3. **Execution**: Real-time status updates
4. **Response**: Natural language answer

## Development Process

### Session History
This project was developed through multiple iterations:

1. **Initial Setup** - Basic Tauri + React structure
2. **MCP Integration** - Connected to ServiceNow MCP server
3. **Tool Discovery** - Implemented dynamic tool loading
4. **Rule-based Processing** - Simple pattern matching for tool selection
5. **LLM Integration** - Added GPT-4 for intelligent processing
6. **UI Improvements** - Fixed scrolling and layout issues

### Key Technical Decisions

#### Why Tauri?
- Native desktop performance
- Secure API key handling
- Cross-platform compatibility
- Smaller bundle size than Electron

#### Why GPT-4 for Tool Selection?
- Superior reasoning capabilities for complex tool selection
- Better understanding of ServiceNow terminology
- Consistent structured output format
- Fallback mechanisms for reliability

#### Why MCP Protocol?
- Standardized interface for tool integration
- JSON-RPC transport for reliability
- Extensible architecture for future tools
- Active development and community support

## Configuration

### OpenAI Integration
The application requires an OpenAI API key configured in `src/services/llm.ts`:
```typescript
const openai = new OpenAI({
  apiKey: 'your-api-key-here',
  dangerouslyAllowBrowser: true
});
```

### ServiceNow MCP Server
The application connects to a ServiceNow MCP server that should be running at:
```
/Users/adampflantzer/desktop/my_apps/servicenow-mcp-consultancy
```

Required server capabilities:
- Tool listing (`list_tools`)
- Tool execution (`call_tool`)
- Connection management
- 28+ ServiceNow administrative tools

## Error Handling

### LLM Fallback
If OpenAI API calls fail, the system falls back to rule-based tool selection:
```typescript
private fallbackToolSelection(userMessage: string, availableTools: Tool[]): ToolSelection {
  // Pattern matching logic for common scenarios
  // Ensures basic functionality even without LLM
}
```

### Connection Resilience
- Automatic retry logic with exponential backoff
- Graceful degradation when MCP server is unavailable
- Clear error messages for troubleshooting

### UI Error Boundaries
React error boundaries prevent crashes and provide recovery options.

## Testing Scenarios

### Basic Tool Operations
- "Test connection to ServiceNow"
- "Create a new incident for email server down"
- "Query all active problems"

### Complex Natural Language Queries
- "How many high priority incidents do we have assigned to the network team?"
- "Create a flow in Flow Designer for automatic ticket assignment"
- "Find all change requests scheduled for this weekend"

### Edge Cases
- Invalid tool requests
- Network connectivity issues
- Malformed ServiceNow responses
- OpenAI API rate limits

## Performance Considerations

### Bundle Size
- Current bundle: ~259KB (gzipped: ~79KB)
- OpenAI SDK adds significant size but provides essential functionality
- Tauri keeps overall app size reasonable

### API Costs
- GPT-4 calls are optimized for cost:
  - Small context windows
  - Structured prompts
  - Fallback to avoid redundant calls
- Estimated cost: ~$0.01-0.03 per complex query

### Memory Usage
- Rust backend provides efficient memory management
- React state is optimized for chat history
- MCP client maintains minimal connection state

## Future Enhancements

### Planned Features
1. **Multi-turn Conversations** - Context awareness across messages
2. **Batch Operations** - Handle multiple related requests
3. **Custom Tool Creation** - Dynamic tool registration
4. **Advanced Filtering** - Complex query builders
5. **Export Capabilities** - Save conversation history and results

### Technical Improvements
1. **Streaming Responses** - Real-time token streaming from GPT-4
2. **Local LLM Support** - Ollama integration for privacy
3. **Caching Layer** - Reduce API calls for repeated queries
4. **Plugin Architecture** - Support for additional MCP servers

## Troubleshooting

### Common Issues

#### "No tools available"
- Ensure ServiceNow MCP server is running
- Check server path configuration
- Verify MCP server capabilities response

#### "LLM selection failed"
- Check OpenAI API key validity
- Verify network connectivity
- Review API rate limits

#### "Tool execution failed"
- Check ServiceNow credentials in MCP server
- Verify tool arguments format
- Review ServiceNow instance permissions

### Debug Information
Enable debug logging by running:
```bash
RUST_LOG=debug npm run tauri dev
```

### Log Locations
- Frontend: Browser developer console
- Backend: Terminal output with RUST_LOG
- ServiceNow MCP Server: Separate terminal session

## Contributing

### Code Style
- TypeScript: Strict mode enabled
- Rust: Standard formatting with rustfmt
- React: Functional components with hooks
- Error handling: Comprehensive try-catch blocks

### Testing Strategy
- Manual testing with real ServiceNow instance
- End-to-end scenarios covering common use cases
- Error condition testing
- Performance validation under load

This documentation captures the current state of the MCP Desktop Client and provides guidance for continued development and maintenance.