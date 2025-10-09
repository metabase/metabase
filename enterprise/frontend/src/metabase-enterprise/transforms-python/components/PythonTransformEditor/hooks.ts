import { useRef } from "react";

import { useExecutePythonMutation } from "metabase-enterprise/api/transform-python";
import { useTestPythonTransformOnPyodide } from "metabase-enterprise/transforms-python/hooks/use-test-python-transform";
import type { TestPythonTransformResponse } from "metabase-types/api";

import type { PythonTransformSourceDraft } from "../PythonTransformEditor";

type TestPythonTransform = {
  isRunning: boolean;
  run: () => void;
  cancel: () => void;
  executionResult?: TestPythonTransformResponse | null;
};

export function useTestPythonTransform(
  source: PythonTransformSourceDraft,
  mode: "pyodide" | "api",
): TestPythonTransform {
  const pyodide = useTestPythonTransformOnPyodide(source);
  const api = useTestPythonTransformOnRunner(source);

  function run() {
    if (mode === "pyodide") {
      return pyodide.run();
    } else {
      return api.run();
    }
  }

  function cancel() {
    pyodide.cancel();
  }

  return {
    run,
    cancel,
    isRunning: mode === "pyodide" ? pyodide.isRunning : api.isRunning,
    executionResult:
      mode === "pyodide" ? pyodide.executionResult : api.executionResult,
  };
}

function useTestPythonTransformOnRunner(source: PythonTransformSourceDraft) {
  const [fetch, { data: executionResult, isLoading }] =
    useExecutePythonMutation();

  const abortionRef = useRef<(() => void) | null>(null);

  async function run() {
    const request = fetch({
      code: source.body,
      source_tables: source["source-tables"],
    });

    abortionRef.current = () => request.abort();
  }

  function cancel() {
    abortionRef.current?.();
  }

  return {
    run,
    cancel,
    isRunning: isLoading,
    executionResult,
  };
}
