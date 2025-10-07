import { t } from "ttag";

import { getErrorMessage } from "metabase/api/utils";

import type {
  ExecutePythonOptions,
  PyodideWorkerCommand,
  PyodideWorkerMessage,
  PythonExecutionResult,
  PythonLibraries,
} from "./types";

const READY_TIMEOUT = 10_000;
const EXECUTE_TIMEOUT = 60_000;

export class PyodideWorkerManager {
  private worker: Worker;
  private ready: Promise<void>;
  status: "initializing" | "ready" | "error";

  constructor() {
    this.status = "initializing";
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

    this.ready = this.waitFor(this.worker, "ready", {
      timeout: READY_TIMEOUT,
    })
      .then(() => {
        this.status = "ready";
      })
      .catch(() => {
        this.status = "error";
      });
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
        timeout: EXECUTE_TIMEOUT,
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
        unsubscribe();
        reject(new Error(t`Aborted`));
      });

      const handler = ({ data }: MessageEvent<PyodideWorkerMessage>) => {
        unsubscribe();
        if (data.type === type) {
          resolve(data as Extract<PyodideWorkerMessage, { type: T }>);
        } else if (data.type === "error") {
          reject(data.error);
        }
      };

      const errHandler = (evt: ErrorEvent) => {
        unsubscribe();
        reject(evt.error ?? new Error(t`Could not start Python worker.`));
      };

      const unsubscribe = () => {
        clearTimeout(timer);
        worker.removeEventListener("message", handler);
        worker.removeEventListener("error", errHandler);
      };

      const timer = setTimeout(() => {
        unsubscribe();
        reject(new Error(t`Timeout waiting for ${type}`));
      }, timeout);

      worker.addEventListener("message", handler);
      worker.addEventListener("error", errHandler);
    });
  }
}
