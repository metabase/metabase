import * as fs from 'fs';
import * as readline from 'readline';
import { parseTraceLine, TraceLine } from './traceParser';

/**
 * Read and filter a trace file line by line
 * @param filePath Path to the trace file
 * @param predicate Function to filter trace lines
 * @param limit Maximum number of results to return
 * @returns An array of matching trace lines
 */
export async function filterTraceFile(
  filePath: string,
  predicate: (line: TraceLine) => boolean,
  limit: number = 100
): Promise<TraceLine[]> {
  // Check if file exists
  if (!fs.existsSync(filePath)) {
    throw new Error(`Trace file not found: ${filePath}`);
  }
  
  const results: TraceLine[] = [];
  
  // Create a read stream and interface for line-by-line reading
  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });
  
  // Process each line
  for await (const line of rl) {
    try {
      const traceLine = parseTraceLine(line);
      
      // Skip invalid or unparseable lines
      if (!traceLine) {
        continue;
      }
      
      // Check if the line matches our filter
      if (predicate(traceLine)) {
        results.push(traceLine);
      }
      
      // Stop if we've reached the limit
      if (results.length >= limit) {
        break;
      }
    } catch (error) {
      // Skip lines that cause errors
      console.error(`Error processing line: ${line}`, error);
      continue;
    }
  }
  
  // Close the file stream
  fileStream.close();
  
  return results;
}

/**
 * Read the entire trace file and return all valid trace lines
 * @param filePath Path to the trace file
 * @returns An array of all trace lines
 */
export async function readEntireTraceFile(filePath: string): Promise<TraceLine[]> {
  // Check if file exists
  if (!fs.existsSync(filePath)) {
    throw new Error(`Trace file not found: ${filePath}`);
  }
  
  const results: TraceLine[] = [];
  
  // Create a read stream and interface for line-by-line reading
  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });
  
  // Process each line
  for await (const line of rl) {
    const traceLine = parseTraceLine(line);
    
    // Skip invalid or unparseable lines
    if (traceLine) {
      results.push(traceLine);
    }
  }
  
  // Close the file stream
  fileStream.close();
  
  return results;
}