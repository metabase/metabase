#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import * as fs from 'fs';
import * as readline from 'readline';
import * as path from 'path';

import { parseTraceLine, matchesNamespace, matchesFunctionName } from './traceParser';
import { filterTraceFile } from './fileReader';
import { associateCallsWithReturns, buildCallHierarchy } from './callStack';
import { formatTraceCalls, formatTraceHierarchy } from './formatter';

// Initialize MCP server
const server = new Server(
  {
    name: "metabase/trace-analyzer",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Define the available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "analyze_namespace_calls",
        description: "Filter trace file for function calls from specific namespaces",
        inputSchema: {
          type: "object",
          properties: {
            trace_file: { 
              type: "string",
              description: "Path to the trace file to analyze"
            },
            namespaces: { 
              type: "array", 
              items: { type: "string" },
              description: "List of namespaces to filter for (e.g. ['metabase.api', 'metabase.query-processor'])"
            },
            limit: { 
              type: "number",
              description: "Maximum number of results to return (default: 100)"
            },
            include_returns: {
              type: "boolean",
              description: "Whether to include return values in the output (default: true)"
            },
            show_hierarchy: {
              type: "boolean",
              description: "Whether to show the call hierarchy (default: false)"
            }
          },
          required: ["trace_file", "namespaces"]
        },
      },
      {
        name: "analyze_function_calls",
        description: "Find specific function calls in the trace file",
        inputSchema: {
          type: "object",
          properties: {
            trace_file: { 
              type: "string",
              description: "Path to the trace file to analyze"
            },
            function_names: { 
              type: "array", 
              items: { type: "string" },
              description: "List of function names to filter for (can include namespace, e.g. ['dashboard/get-dashboard', 'card/create-card'])"
            },
            limit: { 
              type: "number",
              description: "Maximum number of results to return (default: 100)"
            },
            include_returns: {
              type: "boolean",
              description: "Whether to include return values in the output (default: true)"
            },
            show_hierarchy: {
              type: "boolean",
              description: "Whether to show the call hierarchy (default: false)"
            }
          },
          required: ["trace_file", "function_names"]
        },
      },
      {
        name: "get_trace_statistics",
        description: "Get statistics about the trace file",
        inputSchema: {
          type: "object",
          properties: {
            trace_file: { 
              type: "string",
              description: "Path to the trace file to analyze"
            },
            max_sample: { 
              type: "number",
              description: "Maximum number of lines to sample for statistics (default: 10000)"
            }
          },
          required: ["trace_file"]
        },
      }
    ],
  };
});

// Implement the tool handlers
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  
  try {
    // Type assertion for args
    const typedArgs = args as Record<string, any>;
    
    // Check if trace file exists
    if (!fs.existsSync(typedArgs?.trace_file as string)) {
      return {
        content: [{ type: "text", text: `Error: Trace file not found: ${typedArgs?.trace_file}` }],
        isError: true,
      };
    }

    if (name === "analyze_namespace_calls") {
      const trace_file = typedArgs.trace_file as string;
      const namespaces = typedArgs.namespaces as string[];
      const limit = typedArgs.limit as number || 100;
      const include_returns = typedArgs.include_returns as boolean ?? true;
      const show_hierarchy = typedArgs.show_hierarchy as boolean ?? false;
      
      // Validate inputs
      if (!Array.isArray(namespaces) || namespaces.length === 0) {
        return {
          content: [{ type: "text", text: "Error: namespaces must be a non-empty array of strings" }],
          isError: true,
        };
      }
      
      console.error(`Analyzing namespace calls for ${namespaces.join(', ')} in ${trace_file}`);
      
      // Filter the trace file
      const traceLines = await filterTraceFile(
        trace_file,
        (line) => matchesNamespace(line, namespaces),
        limit
      );
      
      console.error(`Found ${traceLines.length} matching namespace calls`);
      
      // Associate calls with returns
      const callsWithReturns = associateCallsWithReturns(traceLines);
      
      let result;
      if (show_hierarchy) {
        // Build call hierarchy
        const hierarchy = buildCallHierarchy(traceLines);
        result = formatTraceHierarchy(hierarchy, include_returns);
      } else {
        // Format for flat output
        result = formatTraceCalls(callsWithReturns, include_returns);
      }
      
      return {
        content: [{ 
          type: "text", 
          text: JSON.stringify({
            count: result.length,
            namespaces,
            calls: result
          }, null, 2) 
        }],
        isError: false,
      };
    }
    else if (name === "analyze_function_calls") {
      const trace_file = typedArgs.trace_file as string;
      const function_names = typedArgs.function_names as string[];
      const limit = typedArgs.limit as number || 100;
      const include_returns = typedArgs.include_returns as boolean ?? true;
      const show_hierarchy = typedArgs.show_hierarchy as boolean ?? false;
      
      // Validate inputs
      if (!Array.isArray(function_names) || function_names.length === 0) {
        return {
          content: [{ type: "text", text: "Error: function_names must be a non-empty array of strings" }],
          isError: true,
        };
      }
      
      console.error(`Analyzing function calls for ${function_names.join(', ')} in ${trace_file}`);
      
      // Filter the trace file
      const traceLines = await filterTraceFile(
        trace_file,
        (line) => matchesFunctionName(line, function_names),
        limit
      );
      
      console.error(`Found ${traceLines.length} matching function calls`);
      
      // Associate calls with returns
      const callsWithReturns = associateCallsWithReturns(traceLines);
      
      let result;
      if (show_hierarchy) {
        // Build call hierarchy
        const hierarchy = buildCallHierarchy(traceLines);
        result = formatTraceHierarchy(hierarchy, include_returns);
      } else {
        // Format for flat output
        result = formatTraceCalls(callsWithReturns, include_returns);
      }
      
      return {
        content: [{ 
          type: "text", 
          text: JSON.stringify({
            count: result.length,
            functionNames: function_names,
            calls: result
          }, null, 2) 
        }],
        isError: false,
      };
    }
    else if (name === "get_trace_statistics") {
      const trace_file = typedArgs.trace_file as string;
      const max_sample = typedArgs.max_sample as number || 10000;
      
      console.error(`Gathering statistics from ${trace_file}`);
      
      let lineCount = 0;
      let namespaceCount = new Map<string, number>();
      let functionCount = new Map<string, number>();
      let maxDepth = 0;
      
      // Create a read stream
      const fileStream = fs.createReadStream(trace_file);
      const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
      });
      
      // Process each line
      for await (const line of rl) {
        lineCount++;
        
        if (lineCount > max_sample) {
          break;
        }
        
        const traceLine = parseTraceLine(line);
        if (!traceLine) continue;
        
        // Update statistics
        if (traceLine.type === 'functionCall' && traceLine.namespace) {
          // Update namespace count
          const nsCount = namespaceCount.get(traceLine.namespace) || 0;
          namespaceCount.set(traceLine.namespace, nsCount + 1);
          
          // Update function count
          if (traceLine.functionName) {
            const funcKey = `${traceLine.namespace}/${traceLine.functionName}`;
            const funcCount = functionCount.get(funcKey) || 0;
            functionCount.set(funcKey, funcCount + 1);
          }
          
          // Update max depth
          maxDepth = Math.max(maxDepth, traceLine.depth);
        }
      }
      
      // Close the file stream
      fileStream.close();
      
      // Sort namespaces and functions by frequency
      const topNamespaces = Array.from(namespaceCount.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .map(([namespace, count]) => ({ namespace, count }));
        
      const topFunctions = Array.from(functionCount.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .map(([func, count]) => ({ function: func, count }));
      
      return {
        content: [{ 
          type: "text", 
          text: JSON.stringify({
            file: trace_file,
            totalLines: lineCount,
            uniqueNamespaces: namespaceCount.size,
            uniqueFunctions: functionCount.size,
            maxCallDepth: maxDepth,
            topNamespaces,
            topFunctions
          }, null, 2) 
        }],
        isError: false,
      };
    }
    
    return {
      content: [{ type: "text", text: `Unknown tool: ${name}` }],
      isError: true,
    };
  } catch (error: any) {
    console.error(`Error executing ${name}:`, error);
    return {
      content: [{ type: "text", text: `Error: ${error.message}` }],
      isError: true,
    };
  }
});

// Run the server
async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Trace analyzer server started");
}

runServer().catch(console.error);