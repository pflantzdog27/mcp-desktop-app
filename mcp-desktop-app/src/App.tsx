import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";
import { ConnectionStatus } from "./components/ConnectionStatus";
import { ChatInterface } from "./components/ChatInterface";
import { ToolsList } from "./components/ToolsList";
import { Tool, ConnectionStatus as ConnectionStatusType, Message, CallToolRequest, CallToolResponse } from "./types/mcp";
import { LLMService } from "./services/llm";

function App() {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatusType>({
    status: 'disconnected'
  });
  const [tools, setTools] = useState<Tool[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isConnecting, setIsConnecting] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [llmService] = useState(() => new LLMService());

  useEffect(() => {
    let interval: number;
    
    if (connectionStatus.status === 'connected') {
      checkConnectionStatus();
      interval = window.setInterval(checkConnectionStatus, 5000);
    }

    return () => {
      if (interval) window.clearInterval(interval);
    };
  }, [connectionStatus.status]);

  const checkConnectionStatus = async () => {
    try {
      const status = await invoke<ConnectionStatusType>('get_connection_status');
      setConnectionStatus(status);
    } catch (error) {
      console.error('Failed to check connection status:', error);
      // Don't crash the app on status check failure
      setConnectionStatus({ status: 'error', message: 'Status check failed' });
    }
  };

  const connectToServer = async () => {
    setIsConnecting(true);
    let retryCount = 0;
    const maxRetries = 3;
    
    while (retryCount < maxRetries) {
      try {
        setConnectionStatus({ status: 'connecting' });
        
        const systemMessage: Message = {
          id: Date.now().toString(),
          role: 'system',
          content: `Connecting to ServiceNow MCP server... (Attempt ${retryCount + 1}/${maxRetries})`,
          timestamp: new Date()
        };
        setMessages([systemMessage]);
        
        // Start ServiceNow MCP server that the desktop app can control
        await invoke('start_mcp_server', {
          request: {
            command: 'node',
            args: ['dist/simple-index.js'],
            cwd: '/Users/adampflantzer/desktop/my_apps/servicenow-mcp-consultancy',
            env: null
          }
        });

        // Wait for server to start and initialize
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Try to discover tools with shorter timeout to prevent hanging
        const tools = await Promise.race([
          invoke<Tool[]>('discover_tools'),
          new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error('Tool discovery timeout after 5 seconds')), 5000)
          )
        ]);
        
        setTools(tools);
        setConnectionStatus({ status: 'connected' });
        
        const successMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'system',
          content: `✅ Connected to ServiceNow MCP server! Discovered ${tools.length} tools including:\n${tools.slice(0, 5).map(t => `• ${t.name}: ${t.description || 'No description'}`).join('\n')}${tools.length > 5 ? `\n... and ${tools.length - 5} more tools` : ''}`,
          timestamp: new Date()
        };
        setMessages([successMessage]);
        return; // Success - exit retry loop
        
      } catch (error) {
        console.error(`Connection attempt ${retryCount + 1} failed:`, error);
        retryCount++;
        
        if (retryCount < maxRetries) {
          const retryMessage: Message = {
            id: (Date.now() + retryCount).toString(),
            role: 'system',
            content: `Connection attempt ${retryCount} failed. Retrying in ${retryCount * 2} seconds...`,
            timestamp: new Date()
          };
          setMessages(prev => [...prev, retryMessage]);
          
          // Wait before retry with shorter backoff to prevent hanging
          await new Promise(resolve => setTimeout(resolve, Math.min(retryCount * 1000, 3000)));
        } else {
          // Final failure
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          console.error('All connection attempts failed:', error);
          
          setConnectionStatus({ 
            status: 'error', 
            message: `Failed after ${maxRetries} attempts: ${errorMessage}`
          });
          
          const errorChatMessage: Message = {
            id: (Date.now() + 100).toString(),
            role: 'system',
            content: `❌ Connection failed after ${maxRetries} attempts.\n\nError: ${errorMessage}\n\nTroubleshooting:\n• Check if ServiceNow MCP server is configured correctly\n• Verify the path: /Users/adampflantzer/desktop/my_apps/servicenow-mcp-consultancy\n• Ensure npm dependencies are installed (run 'npm install')\n• Check server logs for more details`,
            timestamp: new Date()
          };
          setMessages(prev => [...prev, errorChatMessage]);
        }
      }
    }
    
    setIsConnecting(false);
  };

  const disconnectFromServer = async () => {
    try {
      await invoke('disconnect_server');
      setConnectionStatus({ status: 'disconnected' });
      setTools([]);
      setMessages([]);
    } catch (error) {
      console.error('Failed to disconnect:', error);
    }
  };

  const handleSendMessage = async (content: string) => {
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content,
      timestamp: new Date()
    };
    setMessages(prev => [...prev, userMessage]);

    // Show thinking message
    const thinkingMessage: Message = {
      id: (Date.now() + 1).toString(),
      role: 'assistant',
      content: '🧠 Using AI to analyze your request and select the optimal tool...',
      timestamp: new Date()
    };
    setMessages(prev => [...prev, thinkingMessage]);

    try {
      if (tools.length === 0) {
        const noToolMessage: Message = {
          id: (Date.now() + 2).toString(),
          role: 'assistant',
          content: `I don't have any tools available to help with that request. Please connect to the ServiceNow MCP server first.`,
          timestamp: new Date()
        };
        setMessages(prev => prev.slice(0, -1).concat([noToolMessage]));
        return;
      }

      // Use LLM to intelligently select tool and extract arguments
      const toolSelection = await llmService.selectTool(content, tools);
      
      console.log('LLM selected tool:', toolSelection);

      // Find the selected tool
      const selectedTool = tools.find(t => t.name === toolSelection.toolName);
      if (!selectedTool) {
        throw new Error(`Tool "${toolSelection.toolName}" not found in available tools`);
      }

      // Update thinking message to show tool selection
      const toolSelectionMessage: Message = {
        id: (Date.now() + 2).toString(),
        role: 'assistant',
        content: `🎯 **Selected tool:** ${selectedTool.name}\n💭 **Reasoning:** ${toolSelection.reasoning}\n⚙️ **Executing...**`,
        timestamp: new Date()
      };
      setMessages(prev => prev.slice(0, -1).concat([toolSelectionMessage]));

      // Call the selected tool with LLM-generated arguments
      const toolRequest: CallToolRequest = {
        tool_name: toolSelection.toolName,
        arguments: toolSelection.arguments
      };

      const toolResponse = await invoke<CallToolResponse>('call_tool', { request: toolRequest });

      // Use LLM to process and format the response naturally
      const naturalResponse = await llmService.processToolResponse(
        content,
        toolSelection.toolName,
        toolResponse
      );

      const assistantMessage: Message = {
        id: (Date.now() + 3).toString(),
        role: 'assistant',
        content: naturalResponse,
        timestamp: new Date()
      };

      // Replace thinking message with natural response
      setMessages(prev => prev.slice(0, -1).concat([assistantMessage]));

    } catch (error) {
      console.error('LLM-powered tool execution error:', error);
      const errorMessage: Message = {
        id: (Date.now() + 4).toString(),
        role: 'assistant',
        content: `❌ **Error processing your request**\n\n${error instanceof Error ? error.message : 'Unknown error occurred'}\n\nI can help you with:\n${tools.map(t => `• ${t.name}: ${t.description || 'No description'}`).join('\n')}`,
        timestamp: new Date()
      };
      
      // Replace thinking message with error
      setMessages(prev => prev.slice(0, -1).concat([errorMessage]));
    }
  };

  // Error boundary fallback
  if (hasError) {
    return (
      <div style={{ 
        display: 'flex', 
        flexDirection: 'column', 
        height: '100vh',
        backgroundColor: '#fff',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '20px'
      }}>
        <h2 style={{ color: '#F44336', marginBottom: '16px' }}>Application Error</h2>
        <p style={{ marginBottom: '16px', textAlign: 'center' }}>
          The MCP Desktop App encountered an error. This might be due to:
        </p>
        <ul style={{ marginBottom: '20px', textAlign: 'left' }}>
          <li>Connection timeout with the MCP server</li>
          <li>Invalid server response</li>
          <li>Network connectivity issues</li>
        </ul>
        <button
          onClick={() => {
            setHasError(false);
            setConnectionStatus({ status: 'disconnected' });
            setMessages([]);
            setTools([]);
          }}
          style={{
            padding: '8px 16px',
            fontSize: '14px',
            fontWeight: 'bold',
            color: '#fff',
            backgroundColor: '#4CAF50',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          Reset App
        </button>
      </div>
    );
  }

  try {
    return (
      <div style={{ 
        display: 'flex', 
        flexDirection: 'column', 
        height: '100vh',
        backgroundColor: '#fff' 
      }}>
        <header style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          padding: '16px',
          borderBottom: '1px solid #e0e0e0',
          backgroundColor: '#fafafa'
        }}>
          <h1 style={{ margin: 0, fontSize: '24px', color: '#333' }}>MCP Desktop Client</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <ConnectionStatus status={connectionStatus} />
            {connectionStatus.status === 'disconnected' ? (
              <button
                onClick={() => {
                  try {
                    connectToServer();
                  } catch (error) {
                    console.error('Connect button error:', error);
                    setHasError(true);
                  }
                }}
                disabled={isConnecting}
                style={{
                  padding: '8px 16px',
                  fontSize: '14px',
                  fontWeight: 'bold',
                  color: '#fff',
                  backgroundColor: '#4CAF50',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: isConnecting ? 'not-allowed' : 'pointer',
                  opacity: isConnecting ? 0.6 : 1,
                }}
              >
                {isConnecting ? 'Connecting...' : 'Connect to ServiceNow MCP Server'}
              </button>
            ) : connectionStatus.status === 'connected' ? (
              <button
                onClick={() => {
                  try {
                    disconnectFromServer();
                  } catch (error) {
                    console.error('Disconnect button error:', error);
                    setHasError(true);
                  }
                }}
                style={{
                  padding: '8px 16px',
                  fontSize: '14px',
                  fontWeight: 'bold',
                  color: '#fff',
                  backgroundColor: '#F44336',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
              >
                Disconnect
              </button>
            ) : null}
          </div>
        </header>

        <main style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          <ChatInterface 
            messages={messages}
            onSendMessage={handleSendMessage}
            isConnected={connectionStatus.status === 'connected'}
          />
          <ToolsList tools={tools} />
        </main>
      </div>
    );
  } catch (error) {
    console.error('App render error:', error);
    setHasError(true);
    return null;
  }
}

export default App;