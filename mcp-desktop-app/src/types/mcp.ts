export interface Tool {
  name: string;
  description?: string;
  input_schema: {
    type: string;
    properties?: Record<string, any>;
    required?: string[];
  };
}

export interface ConnectionStatus {
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  message?: string;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
}

export interface StartServerRequest {
  command: string;
  args: string[];
  cwd?: string;
  env?: Record<string, string> | null;
}

export interface CallToolRequest {
  tool_name: string;
  arguments?: any;
}

export interface CallToolResponse {
  content: ToolContent[];
  is_error?: boolean;
}

export interface ToolContent {
  type: string;
  text?: string;
}