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
  workers: PyodideWorker[];

  constructor() {
    this.workers = Array.from({ length: 5 }, () => new PyodideWorker());
  }

  private getWorker(): PyodideWorker {
    this.workers.push(new PyodideWorker());
    return this.workers.shift() ?? new PyodideWorker();
  }

  async executePython(
    code: string,
    sources: PyodideTableSource[],
  ): Promise<any> {
    const worker = this.getWorker();
    return worker.executePython(code, sources);
  }
}

class PyodideWorker {
  private worker: Worker;
  private ready: Promise<ReadyMessage>;

  constructor() {
    this.worker = new Worker("/app/assets/pyodide.worker.js");
    this.ready = waitFor(this.worker, "ready", 10000);
  }

  async executePython(
    code: string,
    sources: PyodideTableSource[],
  ): Promise<any> {
    try {
      await this.ready;

      this.worker.postMessage({
        type: "execute",
        data: { code: getPythonScript(code, sources) },
      });

      const evt = await waitFor(this.worker, "results", 30000);

      return {
        output: evt.result,
        stdout: evt.stdout,
        stderr: evt.stderr,
      };
    } finally {
      this.worker.terminate();
    }
  }
}

export const pyodideWorkerManager = new PyodideWorkerManager();

function waitFor<T extends WorkerMessage["type"]>(
  worker: Worker,
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
      worker.removeEventListener("message", handler);
      worker.removeEventListener("error", errHandler);
    };

    worker.addEventListener("message", handler);
    worker.addEventListener("error", errHandler);

    const t = setTimeout(() => {
      unsubscribe();
      reject(new Error(`Timeout waiting for ${type}`));
    }, timeout);
  });
}

function getPythonScript(code: string, sources: PyodideTableSource[]) {
  return `
${code}

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
