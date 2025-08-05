import OpenAI from 'openai';
import { Tool, CallToolResponse } from '../types/mcp';

const openai = new OpenAI({
  apiKey: 'your-openai-api-key-here', // Replace with your OpenAI API key
  dangerouslyAllowBrowser: true
});

export interface ToolSelection {
  toolName: string;
  arguments: any;
  reasoning: string;
}

export class LLMService {
  async selectTool(userMessage: string, availableTools: Tool[]): Promise<ToolSelection> {
    const toolDescriptions = availableTools.map(tool => ({
      name: tool.name,
      description: tool.description || 'No description available',
      inputSchema: tool.input_schema
    }));

    const prompt = `You are an expert ServiceNow assistant. Analyze the user's request and select the most appropriate tool with correct arguments.

User Request: "${userMessage}"

Available Tools:
${toolDescriptions.map(tool => `
- ${tool.name}: ${tool.description}
  Required fields: ${JSON.stringify(tool.inputSchema.required || [])}
  Properties: ${JSON.stringify(tool.inputSchema.properties || {})}
`).join('')}

Based on the user's request, respond with a JSON object containing:
{
  "toolName": "exact_tool_name",
  "arguments": {...tool_arguments...},
  "reasoning": "Brief explanation of why you chose this tool and these arguments"
}

Guidelines:
- For queries/searches, use "query-records" with appropriate table and query parameters
- For creating records, use "create-record" with table and fields
- For testing connections, use "test-connection"
- For catalog items, use "create-catalog-item"
- For flows, use "create-flow"
- Extract specific details from the user's message for arguments
- Use ServiceNow table names (incident, sys_user, problem, change_request, etc.)
- Use encoded queries for ServiceNow (e.g., "active=true^priority=1")

RESPOND ONLY WITH VALID JSON:`;

    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "You are a ServiceNow expert that converts natural language requests into precise tool calls. Always respond with valid JSON only."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.1,
        max_tokens: 500
      });

      const response = completion.choices[0]?.message?.content?.trim();
      if (!response) {
        throw new Error('No response from OpenAI');
      }

      try {
        return JSON.parse(response);
      } catch (parseError) {
        console.error('Failed to parse LLM response:', response);
        throw new Error('Invalid JSON response from LLM');
      }
    } catch (error) {
      console.error('LLM tool selection failed:', error);
      // Fallback to simple pattern matching
      return this.fallbackToolSelection(userMessage, availableTools);
    }
  }

  async processToolResponse(
    userMessage: string, 
    toolName: string, 
    toolResponse: CallToolResponse
  ): Promise<string> {
    const toolOutput = toolResponse.content
      .map(c => c.text)
      .filter(Boolean)
      .join('\n\n');

    const prompt = `You are a helpful ServiceNow assistant. The user asked: "${userMessage}"

The ${toolName} tool was executed and returned:
${toolOutput}

Based on the user's original question and the tool output, provide a clear, helpful response that:
1. Directly answers their question
2. Summarizes key information from the tool output
3. Uses natural language (not just raw data dumps)
4. Provides actionable insights when relevant

For example:
- If they asked "how many incidents are active?", count and tell them the number
- If they asked about specific records, highlight the relevant ones
- If they created something, confirm what was created with key details

Keep your response concise but complete.`;

    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "You are a helpful ServiceNow assistant that interprets tool outputs and provides natural language responses to users."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 400
      });

      const response = completion.choices[0]?.message?.content?.trim();
      return response || `✅ **Used tool: ${toolName}**\n\n${toolOutput}`;
    } catch (error) {
      console.error('LLM response processing failed:', error);
      // Fallback to simple response
      return `✅ **Used tool: ${toolName}**\n\n${toolOutput}`;
    }
  }

  private fallbackToolSelection(userMessage: string, availableTools: Tool[]): ToolSelection {
    const lowercaseMessage = userMessage.toLowerCase();
    
    if (lowercaseMessage.includes('test') || lowercaseMessage.includes('connection')) {
      return {
        toolName: 'test-connection',
        arguments: {},
        reasoning: 'Fallback: User mentioned test or connection'
      };
    }
    
    if (lowercaseMessage.includes('create') || lowercaseMessage.includes('new')) {
      if (lowercaseMessage.includes('flow')) {
        return {
          toolName: 'create-flow',
          arguments: {
            name: 'New Flow',
            description: 'Created via MCP Desktop'
          },
          reasoning: 'Fallback: User wants to create a flow'
        };
      } else {
        return {
          toolName: 'create-record',
          arguments: {
            table: 'incident',
            fields: {
              short_description: userMessage,
              description: `Created via MCP Desktop: ${userMessage}`
            }
          },
          reasoning: 'Fallback: User wants to create something, defaulting to incident'
        };
      }
    }
    
    if (lowercaseMessage.includes('query') || lowercaseMessage.includes('find') || 
        lowercaseMessage.includes('search') || lowercaseMessage.includes('how many')) {
      let table = 'incident';
      if (lowercaseMessage.includes('user')) table = 'sys_user';
      if (lowercaseMessage.includes('problem')) table = 'problem';
      
      return {
        toolName: 'query-records',
        arguments: {
          table: table,
          query: 'active=true',
          limit: 10
        },
        reasoning: `Fallback: User wants to query ${table} table`
      };
    }
    
    // Default fallback
    const defaultTool = availableTools.find(t => t.name === 'test-connection') || availableTools[0];
    return {
      toolName: defaultTool.name,
      arguments: {},
      reasoning: 'Fallback: No clear pattern matched, using default tool'
    };
  }
}