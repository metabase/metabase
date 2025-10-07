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

    this.ready = this.waitFor(this.worker, "ready", {
      timeout: READY_TIMEOUT,
    }).then(() => {
      this.isReady = true;
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
