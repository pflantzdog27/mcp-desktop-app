import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";
import { ConnectionStatus } from "./components/ConnectionStatus";
import { ChatInterface } from "./components/ChatInterface";
import { ToolsList } from "./components/ToolsList";
import { Tool, ConnectionStatus as ConnectionStatusType, Message, CallToolRequest, CallToolResponse } from "./types/mcp";
import { LLMService, ToolChainPlan } from "./services/llm";
import { SettingsService } from "./services/settings";
import { UpdateSetDialog } from "./components/UpdateSetDialog";
import { ApplicationScopeDialog } from "./components/ApplicationScopeDialog";
import { SettingsPage } from "./components/SettingsPage";

function App() {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatusType>({
    status: 'disconnected'
  });
  const [tools, setTools] = useState<Tool[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isConnecting, setIsConnecting] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [llmService] = useState(() => new LLMService());
  const [settingsService] = useState(() => new SettingsService());
  const [showSettings, setShowSettings] = useState(false);
  const [showUpdateSetDialog, setShowUpdateSetDialog] = useState(false);
  const [showScopeDialog, setShowScopeDialog] = useState(false);
  const [pendingToolExecution, setPendingToolExecution] = useState<{
    toolChainPlan: ToolChainPlan;
    userContent: string;
  } | null>(null);
  const [availableUpdateSets, setAvailableUpdateSets] = useState<Array<{id: string, name: string}>>([]);
  const [availableScopes, setAvailableScopes] = useState<Array<{id: string, name: string, scope: string}>>([]);

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

  const executeToolChain = async (plan: ToolChainPlan) => {
    const results: Array<{step: number, toolName: string, response: CallToolResponse, arguments: any}> = [];
    
    for (let i = 0; i < plan.steps.length; i++) {
      const step = plan.steps[i];
      console.log(`Executing step ${i + 1}: ${step.toolName}`);
      
      // Resolve any placeholders from previous steps
      let resolvedArguments = { ...step.arguments };
      if (typeof resolvedArguments === 'object') {
        resolvedArguments = resolvePlaceholders(resolvedArguments, results);
      }
      
      const toolRequest: CallToolRequest = {
        tool_name: step.toolName,
        arguments: resolvedArguments
      };

      try {
        const toolResponse = await invoke<CallToolResponse>('call_tool', { request: toolRequest });
        results.push({
          step: i + 1,
          toolName: step.toolName,
          response: toolResponse,
          arguments: resolvedArguments
        });
        
        // Update UI with step progress
        const stepMessage: Message = {
          id: (Date.now() + 10 + i).toString(),
          role: 'assistant',  
          content: `✅ **Step ${i + 1} completed:** ${step.toolName}\n💭 ${step.reasoning}`,
          timestamp: new Date()
        };
        setMessages(prev => [...prev, stepMessage]);
        
      } catch (error) {
        console.error(`Tool chain step ${i + 1} failed:`, error);
        throw new Error(`Step ${i + 1} (${step.toolName}) failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
    
    return results;
  };

  const resolvePlaceholders = (obj: any, previousResults: Array<{step: number, toolName: string, response: CallToolResponse, arguments: any}>): any => {
    if (typeof obj === 'string') {
      // Replace {{STEP_X_RESULT}} with actual values from previous steps
      return obj.replace(/\{\{STEP_(\d+)_RESULT\}\}/g, (match, stepNum) => {
        const stepIndex = parseInt(stepNum) - 1;
        if (stepIndex < previousResults.length) {
          const result = previousResults[stepIndex];
          // Extract sys_id from the response if available
          const responseText = result.response.content[0]?.text || '';
          const sysIdMatch = responseText.match(/ID: ([a-f0-9]{32})/i);
          return sysIdMatch ? sysIdMatch[1] : `result_from_step_${stepNum}`;
        }
        return match;
      });
    } else if (Array.isArray(obj)) {
      return obj.map(item => resolvePlaceholders(item, previousResults));
    } else if (typeof obj === 'object' && obj !== null) {
      const resolved: any = {};
      for (const [key, value] of Object.entries(obj)) {
        resolved[key] = resolvePlaceholders(value, previousResults);
      }
      return resolved;
    }
    return obj;
  };

  const fetchAvailableUpdateSets = async () => {
    try {
      const toolRequest: CallToolRequest = {
        tool_name: 'query-records',
        arguments: {
          table: 'sys_update_set',
          query: 'state=in progress^ORDERBYDESCsys_created_on',
          fields: 'sys_id,name,description',
          limit: 20
        }
      };
      const response = await invoke<CallToolResponse>('call_tool', { request: toolRequest });
      const responseText = response.content[0]?.text || '[]';
      const updateSets = JSON.parse(responseText.match(/\[[\s\S]*\]/)?.[0] || '[]');
      return updateSets.map((us: any) => ({ id: us.sys_id, name: us.name }));
    } catch (error) {
      console.error('Failed to fetch update sets:', error);
      return [];
    }
  };

  const fetchAvailableScopes = async () => {
    try {
      const toolRequest: CallToolRequest = {
        tool_name: 'query-records',
        arguments: {
          table: 'sys_scope',
          query: 'ORDERBYname',  // Removed active=true to get all scopes
          fields: 'sys_id,name,scope,active',  // Added active field to see status
          limit: 1000  // Increased to handle large instances with ~800 scopes
        }
      };
      const response = await invoke<CallToolResponse>('call_tool', { request: toolRequest });
      const responseText = response.content[0]?.text || '[]';
      
      // Debug: Log the raw response to see what we're getting
      console.log('Raw scope response:', responseText);
      
      const scopes = JSON.parse(responseText.match(/\[[\s\S]*\]/)?.[0] || '[]');
      
      // Debug: Log parsed scopes
      console.log('Parsed scopes count:', scopes.length);
      console.log('Sample scopes:', scopes.slice(0, 10));
      
      // Map scopes and ensure Global is included
      const mappedScopes = scopes.map((s: any) => ({ 
        id: s.scope || s.sys_id, // Use scope field as ID for easier identification
        name: s.name, 
        scope: s.scope,
        active: s.active
      }));
      
      // Debug: Log mapped scopes
      console.log('Mapped scopes count:', mappedScopes.length);
      console.log('Active scopes:', mappedScopes.filter((s: any) => s.active).length);
      console.log('Inactive scopes:', mappedScopes.filter((s: any) => !s.active).length);
      
      // Ensure Global scope is always available
      const hasGlobal = mappedScopes.some((s: any) => s.scope === 'global');
      if (!hasGlobal) {
        console.log('Adding missing Global scope');
        mappedScopes.unshift({ id: 'global', name: 'Global', scope: 'global', active: true });
      }
      
      // Sort by name for better UX
      mappedScopes.sort((a: any, b: any) => a.name.localeCompare(b.name));
      
      return mappedScopes;
    } catch (error) {
      console.error('Failed to fetch scopes:', error);
      return [{ id: 'global', name: 'Global', scope: 'global', active: true }];
    }
  };

  const createUpdateSet = async (_prefix: string, description: string) => {
    // CRITICAL: Ensure we're in the correct application scope before creating update set
    const currentScope = settingsService.getSettings().applicationScope.currentScope;
    if (currentScope) {
      console.log(`Setting application scope to ${currentScope.name} before creating update set`);
      await setApplicationScope(currentScope.id);
    }

    const name = settingsService.generateUpdateSetName(description);
    const toolRequest: CallToolRequest = {
      tool_name: 'create-update-set',
      arguments: {
        name: name,
        description: `Created by MCP Desktop: ${description}`
      }
    };
    const response = await invoke<CallToolResponse>('call_tool', { request: toolRequest });
    const responseText = response.content[0]?.text || '';
    const sysIdMatch = responseText.match(/Sys ID: ([a-f0-9]{32})/i);
    return {
      id: sysIdMatch ? sysIdMatch[1] : '',
      name: name
    };
  };

  const setCurrentUpdateSet = async (updateSetId: string) => {
    // CRITICAL: Ensure we're in the correct application scope before setting update set
    const currentScope = settingsService.getSettings().applicationScope.currentScope;
    if (currentScope) {
      console.log(`Setting application scope to ${currentScope.name} before setting update set`);
      await setApplicationScope(currentScope.id);
    }

    console.log(`📝 Setting current update set to: ${updateSetId}`);
    const toolRequest: CallToolRequest = {
      tool_name: 'set-current-update-set',
      arguments: {
        update_set_id: updateSetId
      }
    };
    const response = await invoke<CallToolResponse>('call_tool', { request: toolRequest });
    console.log(`✅ Update set response:`, response.content[0]?.text || 'No response');
  };

  const setApplicationScope = async (scopeId: string) => {
    console.log(`🎯 Setting application scope to: ${scopeId}`);
    const toolRequest: CallToolRequest = {
      tool_name: 'set-application-scope',
      arguments: {
        scope: scopeId
      }
    };
    const response = await invoke<CallToolResponse>('call_tool', { request: toolRequest });
    console.log(`✅ Application scope set response:`, response.content[0]?.text || 'No response');
  };

  // Test function to verify current ServiceNow state
  const testCurrentServiceNowState = async () => {
    try {
      console.log('🧪 Testing current ServiceNow state...');
      
      // Test 1: Check current update set
      const currentUpdateSetRequest: CallToolRequest = {
        tool_name: 'query-records',
        arguments: {
          table: 'sys_update_set',
          query: 'state=in progress^sys_created_by=javascript:gs.getUserName()^ORDERBYDESCsys_created_on',
          fields: 'sys_id,name,state,sys_created_on',
          limit: 5
        }
      };
      const updateSetResponse = await invoke<CallToolResponse>('call_tool', { request: currentUpdateSetRequest });
      console.log('📝 Current update sets:', updateSetResponse.content[0]?.text);

      // Test 2: Check for records in update set (customer updates)
      const settings = settingsService.getSettings();
      if (settings.updateSet.currentUpdateSet) {
        const customerUpdatesRequest: CallToolRequest = {
          tool_name: 'query-records',
          arguments: {
            table: 'sys_update_xml',
            query: `update_set=${settings.updateSet.currentUpdateSet.id}^ORDERBYDESCsys_created_on`,
            fields: 'sys_id,name,type,target_name,sys_created_on',
            limit: 10
          }
        };
        const customerUpdatesResponse = await invoke<CallToolResponse>('call_tool', { request: customerUpdatesRequest });
        console.log('📋 Customer updates in current update set:', customerUpdatesResponse.content[0]?.text);
      }

      // Test 3: Verify we can create a simple record
      console.log('🔧 Testing record creation...');
      
    } catch (error) {
      console.error('❌ ServiceNow state test failed:', error);
    }
  };

  const checkAndPromptForUpdateSet = async (toolChainPlan: ToolChainPlan): Promise<boolean> => {
    // Check if any tool in the chain needs update set
    const needsUpdateSet = toolChainPlan.steps.some(step => 
      settingsService.needsUpdateSetPrompt(step.toolName)
    );

    if (!needsUpdateSet) return true;

    // Fetch available update sets
    const updateSets = await fetchAvailableUpdateSets();
    setAvailableUpdateSets(updateSets);
    setShowUpdateSetDialog(true);
    
    // Return false to pause execution, will resume after dialog
    return false;
  };

  const checkAndPromptForScope = async (toolChainPlan: ToolChainPlan): Promise<boolean> => {
    // Check if any tool in the chain needs scope
    const needsScope = toolChainPlan.steps.some(step => 
      settingsService.needsScopePrompt(step.toolName)
    );

    if (!needsScope) return true;

    // Fetch available scopes
    const scopes = await fetchAvailableScopes();
    setAvailableScopes(scopes);
    setShowScopeDialog(true);
    
    // Return false to pause execution, will resume after dialog
    return false;
  };

  const executePendingToolChain = async () => {
    if (!pendingToolExecution) return;

    const { toolChainPlan, userContent } = pendingToolExecution;
    setPendingToolExecution(null);

    try {
      if (toolChainPlan.isChain) {
        const results = await executeToolChain(toolChainPlan);
        const finalResponse = await llmService.processToolChainResponse(userContent, results);
        
        const assistantMessage: Message = {
          id: (Date.now() + 3).toString(),
          role: 'assistant',
          content: finalResponse,
          timestamp: new Date()
        };
        setMessages(prev => [...prev, assistantMessage]);
      } else {
        // Single tool execution
        const step = toolChainPlan.steps[0];
        const toolRequest: CallToolRequest = {
          tool_name: step.toolName,
          arguments: step.arguments
        };

        const toolResponse = await invoke<CallToolResponse>('call_tool', { request: toolRequest });
        const naturalResponse = await llmService.processToolResponse(
          userContent,
          step.toolName,
          toolResponse
        );

        const assistantMessage: Message = {
          id: (Date.now() + 3).toString(),
          role: 'assistant',
          content: naturalResponse,
          timestamp: new Date()
        };
        setMessages(prev => [...prev, assistantMessage]);
      }
    } catch (error) {
      console.error('Tool execution error:', error);
      const errorMessage: Message = {
        id: (Date.now() + 4).toString(),
        role: 'assistant',
        content: `❌ **Error executing tool**\n\n${error instanceof Error ? error.message : 'Unknown error occurred'}`,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
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

      // Debug: Log the tools structure
      console.log('Available tools structure:', tools.map(t => ({
        name: t.name,
        description: t.description,
        input_schema: t.input_schema
      })));

      // Use LLM to plan tool chain (single or multiple tools)
      const toolChainPlan = await llmService.planToolChain(content, tools);
      
      console.log('LLM tool chain plan:', toolChainPlan);

      // Check if we need to prompt for scope first, then update set
      const needsScope = await checkAndPromptForScope(toolChainPlan);
      if (!needsScope) {
        // Store for later execution after dialog
        setPendingToolExecution({ toolChainPlan, userContent: content });
        return;
      }

      const needsUpdateSet = await checkAndPromptForUpdateSet(toolChainPlan);
      if (!needsUpdateSet) {
        // Store for later execution after dialog
        setPendingToolExecution({ toolChainPlan, userContent: content });
        return;
      }

      // If we get here, we can execute immediately
      if (toolChainPlan.isChain) {
        // Multi-step workflow
        const chainMessage: Message = {
          id: (Date.now() + 2).toString(),
          role: 'assistant',
          content: `🔗 **Multi-step workflow detected**\n💭 **Plan:** ${toolChainPlan.reasoning}\n📋 **Steps:** ${toolChainPlan.steps.length}\n⚙️ **Executing chain...**`,
          timestamp: new Date()
        };
        setMessages(prev => prev.slice(0, -1).concat([chainMessage]));

        // Execute tool chain
        const results = await executeToolChain(toolChainPlan);
        
        // Process final response
        const finalResponse = await llmService.processToolChainResponse(content, results);
        
        const assistantMessage: Message = {
          id: (Date.now() + 3).toString(),
          role: 'assistant',
          content: finalResponse,
          timestamp: new Date()
        };
        setMessages(prev => prev.slice(0, -1).concat([assistantMessage]));
      } else {
        // Single tool execution (existing logic)
        const step = toolChainPlan.steps[0];
        const selectedTool = tools.find(t => t.name === step.toolName);
        if (!selectedTool) {
          throw new Error(`Tool "${step.toolName}" not found in available tools`);
        }

        const toolSelectionMessage: Message = {
          id: (Date.now() + 2).toString(),
          role: 'assistant',
          content: `🎯 **Selected tool:** ${selectedTool.name}\n💭 **Reasoning:** ${step.reasoning}\n⚙️ **Executing...**`,
          timestamp: new Date()
        };
        setMessages(prev => prev.slice(0, -1).concat([toolSelectionMessage]));

        const toolRequest: CallToolRequest = {
          tool_name: step.toolName,
          arguments: step.arguments
        };

        const toolResponse = await invoke<CallToolResponse>('call_tool', { request: toolRequest });

        const naturalResponse = await llmService.processToolResponse(
          content,
          step.toolName,
          toolResponse
        );

        const assistantMessage: Message = {
          id: (Date.now() + 3).toString(),
          role: 'assistant',
          content: naturalResponse,
          timestamp: new Date()
        };
        setMessages(prev => prev.slice(0, -1).concat([assistantMessage]));
      }

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
            {connectionStatus.status === 'connected' && (
              <button
                onClick={testCurrentServiceNowState}
                style={{
                  padding: '8px 16px',
                  fontSize: '14px',
                  color: '#fff',
                  backgroundColor: '#2196F3',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
              >
                🧪 Test Tools
              </button>
            )}
            <button
              onClick={() => setShowSettings(true)}
              style={{
                padding: '8px 16px',
                fontSize: '14px',
                color: '#666',
                backgroundColor: '#fff',
                border: '1px solid #e0e0e0',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              ⚙️ Settings
            </button>
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

        {/* Settings Page */}
        {showSettings && (
          <SettingsPage
            settingsService={settingsService}
            onClose={() => setShowSettings(false)}
          />
        )}

        {/* Update Set Dialog */}
        {showUpdateSetDialog && (
          <UpdateSetDialog
            settings={settingsService.getSettings().updateSet}
            availableUpdateSets={availableUpdateSets}
            onSelect={async (updateSetId, updateSetName, locked) => {
              try {
                await setCurrentUpdateSet(updateSetId);
                settingsService.setCurrentUpdateSet(updateSetId, updateSetName);
                if (locked) {
                  settingsService.lockUpdateSet(true);
                }
                setShowUpdateSetDialog(false);
                
                // Execute pending tool chain (scope should already be handled)
                if (pendingToolExecution) {
                  executePendingToolChain();
                }
              } catch (error) {
                console.error('Failed to set update set:', error);
              }
            }}
            onCreate={createUpdateSet}
            onCancel={() => {
              setShowUpdateSetDialog(false);
              setPendingToolExecution(null);
            }}
          />
        )}

        {/* Application Scope Dialog */}
        {showScopeDialog && (
          <ApplicationScopeDialog
            settings={settingsService.getSettings().applicationScope}
            availableScopes={availableScopes}
            onSelect={async (scopeId, scopeName, locked) => {
              try {
                await setApplicationScope(scopeId);
                settingsService.setCurrentScope(scopeId, scopeName);
                if (locked) {
                  settingsService.lockApplicationScope(true);
                }
                setShowScopeDialog(false);
                
                // Check if we still need update set prompt
                if (pendingToolExecution) {
                  const needsUpdateSet = await checkAndPromptForUpdateSet(pendingToolExecution.toolChainPlan);
                  if (needsUpdateSet) {
                    // Execute immediately if no update set needed
                    executePendingToolChain();
                  }
                  // If needsUpdateSet is false, the update set dialog will show
                }
              } catch (error) {
                console.error('Failed to set application scope:', error);
              }
            }}
            onCancel={() => {
              setShowScopeDialog(false);
              setPendingToolExecution(null);
            }}
          />
        )}
      </div>
    );
  } catch (error) {
    console.error('App render error:', error);
    setHasError(true);
    return null;
  }
}

export default App;