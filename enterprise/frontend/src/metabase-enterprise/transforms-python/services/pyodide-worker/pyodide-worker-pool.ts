import { t } from "ttag";

import { getErrorMessage } from "metabase/api/utils";

import type {
  PyodideWorkerCommand,
  PyodideWorkerMessage,
  PythonLibraries,
} from "./types";

type ExecutePythonOptions = {
  signal?: AbortSignal;
};

export type PythonExecutionResult<T = unknown> = {
  output?: T;
  error?: string;
  stdout?: string;
  stderr?: string;
};

export class PyodideWorkerPool {
  workers: PyodideWorker[];

  constructor() {
    this.workers = Array.from({ length: 5 }, () => new PyodideWorker());
  }

  private getWorker(): PyodideWorker {
    // add a new worker to the pool so there is always at least one
    this.workers.push(new PyodideWorker());

    // pick a worker that is ready if possible
    const idx = this.workers.findIndex((worker) => worker.isReady);
    const jdx = idx === -1 ? 0 : idx;
    return this.workers.splice(jdx, 1)[0] ?? new PyodideWorker();
  }

  async executePython<T>(
    code: string,
    libraries: PythonLibraries = {},
    options?: ExecutePythonOptions,
  ): Promise<PythonExecutionResult<T>> {
    const worker = this.getWorker();
    return worker.executePython(code, libraries, options);
  }
}

class PyodideWorker {
  private worker: Worker;
  private ready: Promise<void>;
  isReady: boolean;

  constructor() {
    this.isReady = false;
    this.worker = new Worker(
      // This needs to be a URL literal defined inline in the new Worker argument
      // for rspack to correctly resolve it.
      new URL(
        "./pyodide-worker.ts",
        // @ts-expect-error: TypeScript complains about import.meta.url
        import.meta.url,
      ),
      { name: "pyodide-worker" },
    );

    this.ready = this.waitFor(this.worker, "ready", { timeout: 10000 }).then(
      () => {
        this.isReady = true;
      },
    );
  }

  async executePython<T>(
    code: string,
    libraries: PythonLibraries = {},
    options?: ExecutePythonOptions,
  ): Promise<PythonExecutionResult<T>> {
    options?.signal?.addEventListener("abort", () => {
      this.worker.terminate();
    });

    try {
      await this.ready;

      this.send({
        type: "execute",
        code,
        libraries,
      });

      const evt = await this.waitFor(this.worker, "results", {
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

  private send(message: PyodideWorkerCommand) {
    this.worker.postMessage(message);
  }

  private waitFor<T extends PyodideWorkerMessage["type"]>(
    worker: Worker,
    type: T,
    { timeout, signal }: { timeout: number; signal?: AbortSignal },
  ): Promise<Extract<PyodideWorkerMessage, { type: T }>> {
    return new Promise((resolve, reject) => {
      signal?.addEventListener("abort", () => {
        reject(new Error("Aborted"));
      });

      const handler = ({ data }: MessageEvent<PyodideWorkerMessage>) => {
        if (data.type === type) {
          unsubscribe();
          resolve(data as Extract<PyodideWorkerMessage, { type: T }>);
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
}
