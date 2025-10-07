import { PyodideWorkerManager } from "./pyodide-worker-manager";
import type {
  ExecutePythonOptions,
  PythonExecutionResult,
  PythonLibraries,
} from "./types";

export class PyodideWorkerPool {
  workers: PyodideWorkerManager[];

  constructor() {
    this.workers = Array.from({ length: 5 }, () => new PyodideWorkerManager());
  }

  async executePython<T>(
    code: string,
    libraries: PythonLibraries = {},
    options?: ExecutePythonOptions,
  ): Promise<PythonExecutionResult<T>> {
    const worker = this.getWorker();
    return worker.executePython(code, libraries, options);
  }

  private getWorker(): PyodideWorkerManager {
    // remove all workers that have errored out
    this.workers = this.workers.filter((worker) => worker.status !== "error");

    // add a new worker to the pool so there is always at least one in the pool
    this.workers.push(new PyodideWorkerManager());

    // pick a worker that is ready if possible
    const idx = this.workers.findIndex((worker) => worker.status === "ready");
    const jdx = idx === -1 ? 0 : idx;
    return this.workers.splice(jdx, 1)[0] ?? new PyodideWorkerManager();
  }
}
