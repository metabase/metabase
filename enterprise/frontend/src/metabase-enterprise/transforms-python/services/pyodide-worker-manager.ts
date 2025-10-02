export interface PyodideTableSource {
  database_id: number;
  table_name: string;
  schema_name?: string;
  variable_name: string;
  columns: Array<{
    name: string;
    type: string;
  }>;
  rows: Array<Record<string, any>>;
}

interface WorkerMessage {
  type: "init" | "execute";
  id: string;
  data?: any;
}

interface WorkerResponse {
  type: "success" | "error" | "log";
  id: string;
  data?: any;
  error?: string;
}

export class PyodideWorkerManager {
  private static instance: PyodideWorkerManager;
  private worker: Worker | null = null;
  private messageHandlers: Map<
    string,
    { resolve: (value: any) => void; reject: (reason?: any) => void }
  > = new Map();
  private initialized = false;
  private initializingPromise: Promise<void> | null = null;

  private constructor() {}

  static getInstance(): PyodideWorkerManager {
    if (!PyodideWorkerManager.instance) {
      PyodideWorkerManager.instance = new PyodideWorkerManager();
    }
    return PyodideWorkerManager.instance;
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    if (this.initializingPromise) {
      return this.initializingPromise;
    }

    this.initializingPromise = this.initializeWorker();
    await this.initializingPromise;
    this.initialized = true;
  }

  private async initializeWorker(): Promise<void> {
    // Use the static worker file served from assets
    this.worker = new Worker("/app/assets/pyodide.worker.js");

    // Set up message handler
    this.worker.addEventListener(
      "message",
      (event: MessageEvent<WorkerResponse>) => {
        const { type, id, data, error } = event.data;

        if (type === "log") {
          return;
        }

        const handler = this.messageHandlers.get(id);
        if (handler) {
          if (type === "success") {
            handler.resolve(data);
          } else {
            handler.reject(new Error(error || "Unknown error"));
          }
          this.messageHandlers.delete(id);
        }
      },
    );

    // Initialize Pyodide in the worker
    await this.sendMessage({ type: "init", id: "init" });
  }

  private sendMessage(message: WorkerMessage): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.worker) {
        reject(new Error("Worker not initialized"));
        return;
      }

      this.messageHandlers.set(message.id, { resolve, reject });
      this.worker.postMessage(message);

      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.messageHandlers.has(message.id)) {
          this.messageHandlers.delete(message.id);
          reject(new Error(`Operation timed out: ${message.type}`));
        }
      }, 30000);
    });
  }

  async executePython(
    code: string,
    sources: PyodideTableSource[],
  ): Promise<any> {
    await this.initialize();

    // Prepare data for the worker
    const context: Record<string, any> = {};

    // Convert sources to dataframes in the worker
    for (const source of sources) {
      if (source.rows && source.rows.length > 0) {
        context[source.variable_name] = source.rows;
      }
    }

    // Create the Python code that sets up the environment and runs the transform
    const fullCode = `
import pandas as pd
import numpy as np
import json
import sys
import io
from datetime import datetime, date, time, timedelta

# Convert context data to DataFrames
${sources
  .map(
    (source) => `
${source.variable_name} = pd.DataFrame(${JSON.stringify(source.rows)})
`,
  )
  .join("")}

# Define a container for the result
_transform_result = None

# Execute the user's transform function
${code}

# Call the transform function
if 'transform' in locals():
    _transform_result = transform(${sources.map((s) => s.variable_name).join(", ")})

# Convert result to JSON-serializable format
if _transform_result is not None:
    if isinstance(_transform_result, pd.DataFrame):
        _result_json = {
            'columns': _transform_result.columns.tolist(),
            'data': _transform_result.to_dict('records')
        }
    else:
        _result_json = _transform_result
else:
    _result_json = None

_result_json
    `;

    const messageId = `execute-${Date.now()}`;
    const result = await this.sendMessage({
      type: "execute",
      id: messageId,
      data: { code: fullCode },
    });

    // Transform the result to match ExecutionResult interface
    // Convert the DataFrame result to JSON-lines format expected by parseOutput
    let formattedOutput = "";
    if (result.result && result.result.data) {
      // Convert array of row objects to JSON-lines format
      formattedOutput = result.result.data
        .map((row: any) => JSON.stringify(row))
        .join("\n");
    }

    return {
      output: formattedOutput,
      stdout: result.stdout,
      stderr: result.stderr,
    };
  }

  terminate(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
      this.initialized = false;
      this.initializingPromise = null;
      this.messageHandlers.clear();
    }
  }
}

export const pyodideWorkerManager = PyodideWorkerManager.getInstance();
