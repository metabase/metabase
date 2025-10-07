import { useRef, useState } from "react";

import { getErrorMessage } from "metabase/api/utils";

import {
  PyodideWorkerPool,
  type PythonExecutionResult,
  type PythonLibraries,
} from "../services/pyodide-worker";

export function useRunPython<T = unknown>(packages: string[] = []) {
  const [pool] = useState(() => new PyodideWorkerPool(packages));
  const controller = useRef<AbortController | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [data, setData] = useState<PythonExecutionResult<T> | null>(null);

  const executePython = async (
    code: string,
    libraries: PythonLibraries = {},
  ) => {
    if (controller.current) {
      controller.current.abort();
    }
    controller.current = new AbortController();
    const { signal } = controller.current;

    try {
      setIsRunning(true);
      const result = await pool.executePython<T>(code, libraries, { signal });
      if (signal.aborted) {
        return;
      }
      setData(result);
      return result;
    } catch (error) {
      setData({ error: getErrorMessage(error) });
    } finally {
      setIsRunning(false);
    }
  };

  function cancel() {
    controller.current?.abort();
    setIsRunning(false);
  }

  return {
    isRunning,
    data,
    executePython,
    cancel,
  };
}
