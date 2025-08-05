import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";
import { ConnectionStatus } from "./components/ConnectionStatus";
import { ChatInterface } from "./components/ChatInterface";
import { ToolsList } from "./components/ToolsList";
import { Tool, ConnectionStatus as ConnectionStatusType, Message } from "./types/mcp";

function App() {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatusType>({
    status: 'disconnected'
  });
  const [tools, setTools] = useState<Tool[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isConnecting, setIsConnecting] = useState(false);

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
    }
  };

  const connectToServer = async () => {
    setIsConnecting(true);
    try {
      setConnectionStatus({ status: 'connecting' });
      
      // Use proper filesystem server configuration like Claude Desktop
      await invoke('start_mcp_server', {
        request: {
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
          cwd: '/tmp',
          env: null
        }
      });

      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const tools = await invoke<Tool[]>('discover_tools');
      setTools(tools);
      
      setConnectionStatus({ status: 'connected' });
      
      const systemMessage: Message = {
        id: Date.now().toString(),
        role: 'system',
        content: `Connected to MCP server. Discovered ${tools.length} tools.`,
        timestamp: new Date()
      };
      setMessages([systemMessage]);
    } catch (error) {
      console.error('Failed to connect:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Full error details:', error);
      
      setConnectionStatus({ 
        status: 'error', 
        message: errorMessage
      });
      
      // Show error message in chat
      const errorChatMessage: Message = {
        id: (Date.now() + 2).toString(),
        role: 'system',
        content: `Connection failed: ${errorMessage}`,
        timestamp: new Date()
      };
      setMessages([errorChatMessage]);
    } finally {
      setIsConnecting(false);
    }
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

  const handleSendMessage = (content: string) => {
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content,
      timestamp: new Date()
    };
    setMessages(prev => [...prev, userMessage]);

    const toolsInfo = tools.map(t => `- ${t.name}: ${t.description || 'No description'}`).join('\n');
    const assistantMessage: Message = {
      id: (Date.now() + 1).toString(),
      role: 'assistant',
      content: `I can see you have access to the following tools:\n\n${toolsInfo}\n\nNote: This is a proof-of-concept. LLM integration and tool execution will be added later.`,
      timestamp: new Date()
    };
    
    setTimeout(() => {
      setMessages(prev => [...prev, assistantMessage]);
    }, 500);
  };

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
              onClick={connectToServer}
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
              {isConnecting ? 'Connecting...' : 'Connect to Filesystem Server'}
            </button>
          ) : connectionStatus.status === 'connected' ? (
            <button
              onClick={disconnectFromServer}
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
}

export default App;