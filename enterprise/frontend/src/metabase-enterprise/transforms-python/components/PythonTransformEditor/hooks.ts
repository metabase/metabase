import { useRef, useState } from "react";
import { t } from "ttag";

import { getErrorMessage } from "metabase/api/utils";
import { useExecutePythonMutation } from "metabase-enterprise/api/transform-python";
import type { ExecutePythonTransformResponse } from "metabase-types/api";

import type { PythonTransformSourceDraft } from "./PythonTransformEditor";

export type ExecutionResult = {
  output?: string;
  stdout?: string;
  stderr?: string;
  error?: string;
};

type TestPythonScriptState = {
  isRunning: boolean;
  isDirty: boolean;
  executionResult: ExecutionResult | null;
  run: () => void;
  cancel: () => void;
};

export function useTestPythonTransform(
  source: PythonTransformSourceDraft,
): TestPythonScriptState {
  const [executePython, { isLoading: isRunning, originalArgs }] =
    useExecutePythonMutation();
  const abort = useRef<(() => void) | null>(null);
  const [executionResult, setData] =
    useState<ExecutePythonTransformResponse | null>(null);

  const isDirty = originalArgs?.code !== source.body;

  const run = async () => {
    if (source["source-database"] === undefined) {
      return null;
    }
    const request = executePython({
      code: source.body,
      tables: source["source-tables"],
    });
    abort.current = () => request.abort();

    try {
      const data = await request.unwrap();
      setData(data);
    } catch (error) {
      if (typeof error === "object" && error !== null) {
        if ("name" in error && error.name === "AbortError") {
          setData({ error: t`Python script execution was canceled` });
          return;
        }
      }

      const errorMessage = getErrorMessage(error, t`An unknown error occurred`);
      setData({ error: errorMessage });
    }
  };

  const cancel = () => {
    abort.current?.();
  };

  return {
    isRunning,
    isDirty,
    cancel,
    run,
    executionResult,
  };
}
