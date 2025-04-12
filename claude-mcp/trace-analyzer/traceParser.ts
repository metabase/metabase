import * as fs from 'fs';
import * as readline from 'readline';

// Types for our trace parser
export interface TraceLine {
  traceId: string;
  depth: number;
  type: 'functionCall' | 'returnValue';
  namespace?: string;
  functionName?: string;
  returnValue?: string;
  rawLine: string;
}

/**
 * Parse a single line from a Clojure trace file
 * Format: TRACE tXXXXX: [|...] (namespace/function_name)
 * or:     TRACE tXXXXX: [|...] => return_value
 */
export function parseTraceLine(line: string): TraceLine | null {
  // Basic validation - all trace lines start with "TRACE "
  if (!line.startsWith('TRACE ')) {
    return null;
  }
  
  // Extract trace ID - format is "TRACE tXXXXX: ..."
  const traceIdMatch = line.match(/TRACE\s+(t\d+):/);
  if (!traceIdMatch) {
    return null;
  }
  const traceId = traceIdMatch[1];
  
  // Find the position after the trace ID and colon
  const contentStart = line.indexOf(':', line.indexOf(traceId)) + 1;
  
  // Extract the content after the trace ID
  const content = line.substring(contentStart).trim();
  
  // Count the depth based on the number of "|" characters at the start
  const depthPrefix = content.match(/^(\|\s*)+/);
  const depth = depthPrefix ? depthPrefix[0].match(/\|/g)!.length : 0;
  
  // Get the actual content after the depth indicators
  const actualContent = depthPrefix 
    ? content.substring(depthPrefix[0].length) 
    : content;
  
  // Determine if this is a function call or return value
  if (actualContent.startsWith('=>')) {
    // This is a return value
    const returnValue = actualContent.substring(2).trim();
    return {
      traceId,
      depth,
      type: 'returnValue',
      returnValue,
      rawLine: line
    };
  } else {
    // This is a function call
    // Format is typically "(namespace/function-name)"
    const functionMatch = actualContent.match(/\(([^/]+)\/([^)]+)\)/);
    if (functionMatch) {
      return {
        traceId,
        depth,
        type: 'functionCall',
        namespace: functionMatch[1],
        functionName: functionMatch[2],
        rawLine: line
      };
    }
    
    // Handle cases where there might not be a namespace
    const simpleMatch = actualContent.match(/\(([^)]+)\)/);
    if (simpleMatch) {
      // Try to split at the last dot for cases like (some.namespace.function)
      const parts = simpleMatch[1].split('.');
      if (parts.length > 1) {
        const fn = parts.pop() || '';
        const ns = parts.join('.');
        return {
          traceId,
          depth,
          type: 'functionCall',
          namespace: ns,
          functionName: fn,
          rawLine: line
        };
      }
      
      return {
        traceId,
        depth,
        type: 'functionCall',
        functionName: simpleMatch[1],
        rawLine: line
      };
    }
  }
  
  // If we can't parse the line properly, return null
  return null;
}

/**
 * Check if a trace line matches the given namespace
 */
export function matchesNamespace(traceLine: TraceLine, namespaces: string[]): boolean {
  if (traceLine.type !== 'functionCall' || !traceLine.namespace) {
    return false;
  }
  
  return namespaces.some(ns => 
    traceLine.namespace === ns || 
    traceLine.namespace?.startsWith(ns + '.') ||
    traceLine.namespace?.startsWith(ns + '/')
  );
}

/**
 * Check if a trace line matches the given function name
 */
export function matchesFunctionName(traceLine: TraceLine, functionNames: string[]): boolean {
  if (traceLine.type !== 'functionCall') {
    return false;
  }
  
  for (const fnName of functionNames) {
    // Check for fully qualified names (namespace/function)
    if (fnName.includes('/')) {
      const [ns, fn] = fnName.split('/');
      if (traceLine.namespace === ns && traceLine.functionName === fn) {
        return true;
      }
    }
    // Check for simple function name match
    else if (traceLine.functionName === fnName) {
      return true;
    }
  }
  
  return false;
}