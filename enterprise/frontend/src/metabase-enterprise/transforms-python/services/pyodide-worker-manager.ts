import type { RowValue } from "metabase-types/api";

export type PyodideTableSource = {
  database_id: number;
  variable_name: string;
  columns: {
    name: string;
    type: string;
  }[];
  rows: Record<string, RowValue>[];
};

export type PythonExecutionResult = {
  columns: string[];
  data: Record<string, RowValue>[];
};

type ReadyMessage = { type: "ready" };
type ResultsMessage = {
  type: "results";
  stdout: string;
  stderr: string;
  result: PythonExecutionResult;
};

type WorkerMessage = ReadyMessage | ResultsMessage;

class PyodideWorkerManager {
  private worker: Worker;

  constructor() {
    this.worker = new Worker("/app/assets/pyodide.worker.js");
  }

  async initialize(): Promise<void> {
    await this.waitFor("ready", 10000);
  }

  waitFor<T extends WorkerMessage["type"]>(
    type: T,
    timeout: number,
  ): Promise<Extract<WorkerMessage, { type: T }>> {
    return new Promise((resolve, reject) => {
      const handler = ({ data }: MessageEvent<WorkerMessage>) => {
        if (data.type === type) {
          unsubscribe();
          resolve(data as Extract<WorkerMessage, { type: T }>);
        }
      };

      const errHandler = (evt: ErrorEvent) => {
        reject(evt.error);
      };

      const unsubscribe = () => {
        clearTimeout(t);
        this.worker.removeEventListener("message", handler);
        this.worker.removeEventListener("error", errHandler);
      };

      this.worker.addEventListener("message", handler);
      this.worker.addEventListener("error", errHandler);

      const t = setTimeout(() => {
        unsubscribe();
        reject(new Error(`Timeout waiting for ${type}`));
      }, timeout);
    });
  }

  async executePython(
    code: string,
    sources: PyodideTableSource[],
  ): Promise<any> {
    await this.initialize();

    this.worker.postMessage({
      type: "execute",
      data: { code: getPythonScript(code, sources) },
    });

    const evt = await this.waitFor("results", 30000);

    return {
      output: evt.result,
      stdout: evt.stdout,
      stderr: evt.stderr,
    };
  }

  terminate() {
    this.worker.terminate();
  }
}

export const pyodideWorkerManager = new PyodideWorkerManager();

function getPythonScript(code: string, sources: PyodideTableSource[]) {
  return `
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
}
