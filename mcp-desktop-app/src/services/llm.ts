import OpenAI from 'openai';
import { Tool, CallToolResponse } from '../types/mcp';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || 'your-openai-api-key-here', // Set your OpenAI API key
  dangerouslyAllowBrowser: true
});

export interface ToolSelection {
  toolName: string;
  arguments: any;
  reasoning: string;
}

export interface ToolChainStep {
  toolName: string;
  arguments: any;
  reasoning: string;
  dependsOn?: string; // ID of previous step this depends on
}

export interface ToolChainPlan {
  steps: ToolChainStep[];
  isChain: boolean;
  reasoning: string;
}

export class LLMService {
  async planToolChain(userMessage: string, availableTools: Tool[]): Promise<ToolChainPlan> {
    const toolDescriptions = availableTools.map(tool => ({
      name: tool.name,
      description: tool.description || 'No description available',
      inputSchema: tool.input_schema || { type: 'object', properties: {}, required: [] }
    }));

    const prompt = `You are an expert ServiceNow workflow designer. Analyze the user's request and determine if it requires multiple tools to be executed in sequence (tool chaining) or just a single tool.

User Request: "${userMessage}"

Available Tools:
${toolDescriptions.map(tool => `
- ${tool.name}: ${tool.description}
  Required fields: ${JSON.stringify(tool.input_schema?.required || [])}
  Properties: ${JSON.stringify(tool.input_schema?.properties || {})}
`).join('')}

For multi-step requests that require tool chaining, respond with:
{
  "isChain": true,
  "reasoning": "This request requires multiple steps: [list steps]",
  "steps": [
    {
      "toolName": "first_tool",
      "arguments": {...arguments...},
      "reasoning": "Why this tool is needed first",
      "dependsOn": null
    },
    {
      "toolName": "second_tool", 
      "arguments": {...arguments using {{STEP_1_RESULT}} for previous results...},
      "reasoning": "Why this tool is needed second",
      "dependsOn": "STEP_1"
    }
  ]
}

For single-step requests, respond with:
{
  "isChain": false,
  "reasoning": "This can be accomplished with a single tool",
  "steps": [
    {
      "toolName": "tool_name",
      "arguments": {...arguments...},
      "reasoning": "Why this tool was selected"
    }
  ]
}

Guidelines:
- Flow creation workflows typically need: create-flow → create-flow-trigger → add-*-action
- Use {{STEP_X_RESULT}} placeholders for values from previous steps (e.g., flow_id from step 1)
- Password reset flows should trigger on record creation/update
- Common trigger types: record_created, record_updated, scheduled
- Action order should increment (100, 200, 300, etc.)

RESPOND ONLY WITH VALID JSON:`;

    try {
      console.log('🧠 LLM Planning - User Request:', userMessage);
      console.log('🧠 LLM Planning - Available Tools:', toolDescriptions.length);
      
      // Debug: Show specific business rule tool schema if user mentions business rule
      if (userMessage.toLowerCase().includes('business rule')) {
        const businessRuleTool = availableTools.find(t => t.name.includes('business-rule'));
        if (businessRuleTool) {
          console.log('🔍 Business Rule Tool Found:', {
            name: businessRuleTool.name,
            description: businessRuleTool.description,
            schema: businessRuleTool.input_schema
          });
        } else {
          console.log('❌ No business rule tool found in available tools');
          console.log('Available tool names:', availableTools.map(t => t.name));
        }
      }

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "You are a ServiceNow workflow expert that plans multi-step tool execution chains. Always respond with valid JSON only."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.1,
        max_tokens: 1000
      });

      const response = completion.choices[0]?.message?.content?.trim();
      if (!response) {
        throw new Error('No response from OpenAI');
      }

      console.log('🤖 LLM Raw Response:', response);

      try {
        const parsed = JSON.parse(response);
        console.log('✅ LLM Parsed Plan:', parsed);
        return parsed;
      } catch (parseError) {
        console.error('Failed to parse LLM chain response:', response);
        throw new Error('Invalid JSON response from LLM');
      }
    } catch (error) {
      console.error('LLM tool chain planning failed:', error);
      // Fallback to single tool selection
      const singleTool = await this.selectTool(userMessage, availableTools);
      return {
        isChain: false,
        reasoning: 'Fallback to single tool due to LLM error',
        steps: [singleTool]
      };
    }
  }

  async selectTool(userMessage: string, availableTools: Tool[]): Promise<ToolSelection> {
    const toolDescriptions = availableTools.map(tool => ({
      name: tool.name,
      description: tool.description || 'No description available',
      inputSchema: tool.input_schema || { type: 'object', properties: {}, required: [] }
    }));

    const prompt = `You are an expert ServiceNow assistant. Analyze the user's request and select the most appropriate tool with correct arguments.

User Request: "${userMessage}"

Available Tools:
${toolDescriptions.map(tool => `
- ${tool.name}: ${tool.description}
  Required fields: ${JSON.stringify(tool.input_schema?.required || [])}
  Properties: ${JSON.stringify(tool.input_schema?.properties || {})}
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

  async processToolChainResponse(
    userMessage: string,
    chainResults: Array<{step: number, toolName: string, response: CallToolResponse, arguments: any}>
  ): Promise<string> {
    const resultsText = chainResults.map(result => {
      const output = result.response.content.map(c => c.text).filter(Boolean).join('\n');
      return `Step ${result.step} (${result.toolName}): ${output}`;
    }).join('\n\n');

    const prompt = `You are a helpful ServiceNow assistant. The user requested: "${userMessage}"

This required a multi-step workflow that was successfully completed. Here are the results of each step:

${resultsText}

Provide a comprehensive summary that:
1. Confirms what was accomplished
2. Highlights key details from each step
3. Explains how the steps worked together
4. Uses natural language (not raw data dumps)

Keep your response clear and professional.`;

    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "You are a helpful ServiceNow assistant that summarizes multi-step workflow results for users."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 500
      });

      const response = completion.choices[0]?.message?.content?.trim();
      return response || `✅ **Multi-step workflow completed successfully**\n\n${resultsText}`;
    } catch (error) {
      console.error('LLM chain response processing failed:', error);
      return `✅ **Multi-step workflow completed successfully**\n\n${resultsText}`;
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