import { t } from "ttag";

import { getErrorMessage } from "metabase/api/utils";

import type {
  ExecutePythonOptions,
  PyodideWorkerCommand,
  PyodideWorkerMessage,
  PythonExecutionResult,
  PythonLibraries,
} from "./types";
import { withTimeout } from "./utils";

const READY_TIMEOUT = 60_000;
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

    this.send({ type: "init" });

    this.ready = this.waitFor("ready", { timeout: READY_TIMEOUT })
      .then(() => {
        this.status = "ready";
      })
      .catch((err) => {
        this.status = "error";
        throw err;
      });
  }

  async executePython<T>(
    code: string,
    libraries: PythonLibraries = {},
    options?: ExecutePythonOptions,
  ): Promise<PythonExecutionResult<T>> {
    options?.signal?.addEventListener("abort", () => {
      // Terminate the worker, which will cause waitFor to reject with "Worker terminated"
      this.terminate();
    });

    try {
      await this.ready;

      this.send({ type: "execute", code, libraries });

      const evt = await this.waitFor("results", {
        timeout: EXECUTE_TIMEOUT,
        signal: options?.signal,
      });

      return {
        output: evt.result ? JSON.parse(evt.result) : null,
        error: evt.error,
        logs: evt.logs,
      };
    } catch (error) {
      return {
        error: { message: getErrorMessage(error) },
      };
    } finally {
      this.terminate();
    }
  }

  cleanup() {
    this.worker.terminate();
  }

  private send(message: PyodideWorkerCommand) {
    this.worker.postMessage(message);
  }

  private terminate() {
    this.send({ type: "terminate" });
  }

  private waitFor<T extends PyodideWorkerMessage["type"]>(
    type: T,
    { timeout, signal }: { timeout: number; signal?: AbortSignal },
  ): Promise<Extract<PyodideWorkerMessage, { type: T }>> {
    return new Promise((resolve, reject) => {
      withTimeout(signal, timeout).addEventListener("abort", (reason) => {
        unsubscribe();
        reject(reason ?? new Error(t`Aborted`));
      });

      const handleMessage = ({ data }: MessageEvent<PyodideWorkerMessage>) => {
        switch (data.type) {
          case type:
            unsubscribe();
            return resolve(data as Extract<PyodideWorkerMessage, { type: T }>);
          case "error":
            unsubscribe();
            return reject(data.error);
          case "terminated":
            unsubscribe();
            return reject(new Error(t`Worker terminated`));
        }
      };

      const handleError = (evt: ErrorEvent) => {
        unsubscribe();
        reject(evt.error ?? new Error(t`Could not start Python worker.`));
      };

      const unsubscribe = () => {
        this.worker.removeEventListener("message", handleMessage);
        this.worker.removeEventListener("error", handleError);
      };

      this.worker.addEventListener("message", handleMessage);
      this.worker.addEventListener("error", handleError);
    });
  }
}
