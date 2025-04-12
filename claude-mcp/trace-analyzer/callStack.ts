import { TraceLine } from './traceParser';

export interface TraceCallWithReturn extends TraceLine {
  returnLine?: TraceLine;
  children?: TraceCallWithReturn[];
}

/**
 * Process trace lines to build a call stack structure
 * This associates return values with their function calls and establishes parent-child relationships
 * @param traceLines An array of trace lines
 * @returns An array of trace calls with their return values and children
 */
export function buildCallHierarchy(traceLines: TraceLine[]): TraceCallWithReturn[] {
  const traceMap = new Map<string, { call: TraceLine; returnValue?: TraceLine }>();
  const rootCalls: TraceCallWithReturn[] = [];
  const depthStacks: { [depth: number]: TraceCallWithReturn[] } = {};
  
  // First pass: associate function calls with their return values by trace ID
  traceLines.forEach(line => {
    if (line.type === 'functionCall') {
      traceMap.set(line.traceId, { call: line });
    } else if (line.type === 'returnValue') {
      const entry = traceMap.get(line.traceId);
      if (entry) {
        entry.returnValue = line;
      }
    }
  });
  
  // Second pass: build the call hierarchy based on depth
  traceLines.forEach(line => {
    if (line.type === 'functionCall') {
      const depth = line.depth;
      const callWithReturn: TraceCallWithReturn = {
        ...line,
        returnLine: traceMap.get(line.traceId)?.returnValue,
        children: []
      };
      
      // Store the current call in the stack for its depth
      if (!depthStacks[depth]) {
        depthStacks[depth] = [];
      }
      depthStacks[depth].push(callWithReturn);
      
      // If we're at depth 0, this is a root call
      if (depth === 0) {
        rootCalls.push(callWithReturn);
      } 
      // Otherwise, add it as a child to the most recent call at the previous depth
      else if (depthStacks[depth - 1] && depthStacks[depth - 1].length > 0) {
        const parentIndex = depthStacks[depth - 1].length - 1;
        const parent = depthStacks[depth - 1][parentIndex];
        if (parent.children) {
          parent.children.push(callWithReturn);
        }
      }
    }
  });
  
  return rootCalls;
}

/**
 * Flatten a call hierarchy back to a list of calls with their returns
 * @param callHierarchy A hierarchy of trace calls
 * @returns A flattened list of calls with their return values
 */
export function flattenCallHierarchy(callHierarchy: TraceCallWithReturn[]): TraceCallWithReturn[] {
  const result: TraceCallWithReturn[] = [];
  
  function flatten(calls: TraceCallWithReturn[]) {
    calls.forEach(call => {
      result.push(call);
      if (call.children && call.children.length > 0) {
        flatten(call.children);
      }
    });
  }
  
  flatten(callHierarchy);
  return result;
}

/**
 * Associate function calls with their return values
 * @param traceLines An array of trace lines
 * @returns An array of function calls with their return values
 */
export function associateCallsWithReturns(traceLines: TraceLine[]): TraceCallWithReturn[] {
  const result: TraceCallWithReturn[] = [];
  const traceMap = new Map<string, number>();
  
  // First, collect all function calls
  traceLines.forEach((line, index) => {
    if (line.type === 'functionCall') {
      traceMap.set(line.traceId, result.length);
      result.push({
        ...line
      });
    }
  });
  
  // Then associate return values
  traceLines.forEach(line => {
    if (line.type === 'returnValue') {
      const index = traceMap.get(line.traceId);
      if (index !== undefined) {
        result[index].returnLine = line;
      }
    }
  });
  
  return result;
}