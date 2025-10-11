import { PyodideWorkerManager } from "./pyodide-worker-manager";
import type {
  ExecutePythonOptions,
  PythonExecutionResult,
  PythonLibraries,
} from "./types";

const MAX_PYODIDE_WORKERS = 5;

// A pool of Pyodide workers.
// The pool attemps to keep MAX_PYODIDE_WORKERS workers ready at all times.
// Pyodide workers cannot be reused because the user-script can polute
// the global namespace in the Python vm.
//
// Starting up a worker is a little bit slow, and running the actual script is relatively fast.
// Therefore, we start up MAX_PYODIDE_WORKERS at once so they are ready to use when needed.
export class PyodideWorkerPool {
  workers: PyodideWorkerManager[];

  constructor() {
    this.workers = Array.from(
      { length: MAX_PYODIDE_WORKERS },
      () => new PyodideWorkerManager(),
    );
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
