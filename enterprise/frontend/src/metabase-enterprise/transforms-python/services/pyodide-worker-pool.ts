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

type ExecutePythonOptions = {
  signal?: AbortSignal;
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

export class PyodideWorkerPool {
  workers: PyodideWorker[];
  packages: string[];

  constructor(packages: string[] = []) {
    this.packages = packages;
    this.workers = Array.from({ length: 5 }, () => new PyodideWorker(packages));
  }

  private getWorker(): PyodideWorker {
    this.workers.push(new PyodideWorker(this.packages));
    return this.workers.shift() ?? new PyodideWorker(this.packages);
  }

  async executePython(
    code: string,
    sources: PyodideTableSource[],
    options?: ExecutePythonOptions,
  ): Promise<any> {
    const worker = this.getWorker();
    return worker.executePython(code, sources, options);
  }
}

class PyodideWorker {
  private worker: Worker;
  private ready: Promise<ReadyMessage>;

  constructor(packages: string[] = []) {
    const url = new URL("/app/assets/pyodide.worker.js", window.location.href);
    for (const pkg of packages) {
      url.searchParams.append("packages", pkg);
    }

    this.worker = new Worker(url.toString());
    this.ready = waitFor(this.worker, "ready", 10000);
  }

  async executePython(
    code: string,
    sources: PyodideTableSource[],
    options?: ExecutePythonOptions,
  ): Promise<any> {
    options?.signal?.addEventListener("abort", () => {
      this.worker.terminate();
    });

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
