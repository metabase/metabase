import { TraceLine } from './traceParser';
import { TraceCallWithReturn } from './callStack';

/**
 * A formatted trace call suitable for returning from the MCP server
 */
export interface FormattedTraceCall {
  traceId: string;
  depth: number;
  namespace?: string;
  functionName: string;
  qualifiedName: string;
  returnValue?: string;
  hasChildren?: boolean;
  childCount?: number;
}

/**
 * Format a trace call with return for output
 */
export function formatTraceCall(call: TraceCallWithReturn, includeReturns: boolean = true): FormattedTraceCall {
  const result: FormattedTraceCall = {
    traceId: call.traceId,
    depth: call.depth,
    namespace: call.namespace,
    functionName: call.functionName || 'unknown',
    qualifiedName: call.namespace 
      ? `${call.namespace}/${call.functionName}` 
      : call.functionName || 'unknown'
  };
  
  // Add return value if available and requested
  if (includeReturns && call.returnLine?.returnValue) {
    result.returnValue = call.returnLine.returnValue;
  }
  
  // Add children information if available
  if (call.children && call.children.length > 0) {
    result.hasChildren = true;
    result.childCount = call.children.length;
  }
  
  return result;
}

/**
 * Format a trace hierarchy for output
 */
export function formatTraceHierarchy(
  calls: TraceCallWithReturn[], 
  includeReturns: boolean = true,
  maxDepth: number = 10
): any {
  function formatCall(call: TraceCallWithReturn, currentDepth: number = 0): any {
    const result: any = {
      qualifiedName: call.namespace 
        ? `${call.namespace}/${call.functionName}` 
        : call.functionName || 'unknown',
      depth: call.depth
    };
    
    // Add return value if available and requested
    if (includeReturns && call.returnLine?.returnValue) {
      result.returnValue = call.returnLine.returnValue;
    }
    
    // Add children if we haven't reached max depth
    if (call.children && call.children.length > 0 && currentDepth < maxDepth) {
      result.children = call.children.map(child => formatCall(child, currentDepth + 1));
    } else if (call.children && call.children.length > 0) {
      result.hasMoreChildren = true;
      result.childCount = call.children.length;
    }
    
    return result;
  }
  
  return calls.map(call => formatCall(call));
}

/**
 * Format a list of trace calls for output
 */
export function formatTraceCalls(
  calls: TraceCallWithReturn[], 
  includeReturns: boolean = true
): FormattedTraceCall[] {
  return calls.map(call => formatTraceCall(call, includeReturns));
}