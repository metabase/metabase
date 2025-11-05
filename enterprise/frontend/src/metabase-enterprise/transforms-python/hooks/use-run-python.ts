import { useEffect, useRef, useState } from "react";

import { getErrorMessage } from "metabase/api/utils";

import {
  PyodideWorkerPool,
  type PythonExecutionResult,
  type PythonLibraries,
} from "../services/pyodide-worker";

import type { PythonTransformResultData } from "./use-test-python-transform";

export function useRunPython<T = PythonTransformResultData>() {
  const [pool] = useState(() => new PyodideWorkerPool());
  const controller = useRef<AbortController | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [data, setData] = useState<PythonExecutionResult<T> | null>(null);

  useEffect(() => {
    return () => {
      // Clean up all workers when the component unmounts
      pool.cleanup();
    };
  }, [pool]);

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
      setData({ error: { message: getErrorMessage(error) } });
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
