import { t } from "ttag";

import { getErrorMessage } from "metabase/api/utils";
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

export type PythonExecutionResult<T = unknown> = {
  output?: T;
  error?: string;
  stdout?: string;
  stderr?: string;
};

type ErrorMessage = { type: "error"; error: Error };
type ReadyMessage = { type: "ready" };
type ResultsMessage = {
  type: "results";
  error?: string;
  result?: string;
  stdout: string;
  stderr: string;
};

type WorkerMessage = ReadyMessage | ResultsMessage | ErrorMessage;

export class PyodideWorkerPool {
  workers: PyodideWorker[];
  packages: string[];

  constructor(packages: string[] = []) {
    this.packages = packages;
    this.workers = Array.from({ length: 5 }, () => new PyodideWorker(packages));
  }

  private getWorker(): PyodideWorker {
    // add a new worker to the pool so there is always at least one
    this.workers.push(new PyodideWorker(this.packages));

    // pick a worker that is ready if possible
    const idx = this.workers.findIndex((worker) => worker.isReady);
    const jdx = idx === -1 ? 0 : idx;
    return this.workers.splice(jdx, 1)[0] ?? new PyodideWorker(this.packages);
  }

  async executePython<T>(
    code: string,
    sources: PyodideTableSource[],
    options?: ExecutePythonOptions,
  ): Promise<PythonExecutionResult<T>> {
    const worker = this.getWorker();
    return worker.executePython(code, sources, options);
  }
}

class PyodideWorker {
  private worker: Worker;
  private ready: Promise<void>;
  isReady: boolean;

  constructor(packages: string[] = []) {
    const url = new URL("/app/assets/pyodide.worker.js", window.location.href);
    for (const pkg of packages) {
      url.searchParams.append("packages", pkg);
    }

    this.isReady = false;
    this.worker = new Worker(url.toString());
    this.ready = waitFor(this.worker, "ready", { timeout: 10000 }).then(() => {
      this.isReady = true;
    });
  }

  async executePython<T>(
    code: string,
    sources: PyodideTableSource[],
    options?: ExecutePythonOptions,
  ): Promise<PythonExecutionResult<T>> {
    options?.signal?.addEventListener("abort", () => {
      this.worker.terminate();
    });

    try {
      await this.ready;

      this.worker.postMessage({
        type: "execute",
        data: { code: getPythonScript(code, sources) },
      });

      const evt = await waitFor(this.worker, "results", {
        timeout: 30000,
        signal: options?.signal,
      });

      return {
        output: evt.result ? JSON.parse(evt.result) : null,
        error: evt.error,
        stdout: evt.stdout,
        stderr: evt.stderr,
      };
    } catch (error) {
      return {
        error: getErrorMessage(error),
      };
    } finally {
      this.worker.terminate();
    }
  }
}

function waitFor<T extends WorkerMessage["type"]>(
  worker: Worker,
  type: T,
  { timeout, signal }: { timeout: number; signal?: AbortSignal },
): Promise<Extract<WorkerMessage, { type: T }>> {
  return new Promise((resolve, reject) => {
    signal?.addEventListener("abort", () => {
      reject(new Error("Aborted"));
    });

    const handler = ({ data }: MessageEvent<WorkerMessage>) => {
      if (data.type === type) {
        unsubscribe();
        resolve(data as Extract<WorkerMessage, { type: T }>);
      }
      if (data.type === "error") {
        unsubscribe();
        reject(data.error);
      }
    };

    const errHandler = (evt: ErrorEvent) => {
      reject(evt.error ?? new Error(t`Could not start Python worker.`));
    };

    const unsubscribe = () => {
      clearTimeout(timer);
      worker.removeEventListener("message", handler);
      worker.removeEventListener("error", errHandler);
    };

    worker.addEventListener("message", handler);
    worker.addEventListener("error", errHandler);

    const timer = setTimeout(() => {
      unsubscribe();
      reject(new Error(`Timeout waiting for ${type}`));
    }, timeout);
  });
}

function getPythonScript(code: string, sources: PyodideTableSource[]) {
  // add a random suffix to the main function to avoid it
  // from being used in the transform function which would lead to
  // unexpected results.
  const random = Math.random().toString(36).slice(2);

  // Encode the columns as base64 JSON to avoid issues with
  // escaping
  const encoded = btoa(JSON.stringify(sources.map((source) => source.rows)));

  return [
    // code should sit at the top of the script, so line numbers in errors
    // are correct
    code,
    `
def __run_transform_${random}():
  import json
  import base64

  if 'transform' not in globals():
    raise Exception('No transform function defined')

  encoded = '${encoded}'
  columns = json.loads(
    base64.b64decode(encoded)
  )

  # run user-defind transform
  result = transform(*columns)

  if result is None:
    raise Exception('Transform function did not return a result')

  if not isinstance(result, pd.DataFrame):
    raise Exception('Transform function did not return a DataFrame')

  return json.dumps({
    'columns': result.columns.tolist(),
    'data': result.to_dict('records')
  })

__run_transform_${random}()
`,
  ].join("\n");
}
