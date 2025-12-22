import { useRef } from "react";
import { t } from "ttag";

import { getErrorMessage } from "metabase/api/utils";
import { useExecutePythonMutation } from "metabase-enterprise/api/transform-python";
import type {
  PythonTransformSourceDraft,
  TestPythonTransformResponse,
} from "metabase-types/api";

type TestPythonScriptState = {
  isRunning: boolean;
  isDirty: boolean;
  executionResult: TestPythonTransformResponse;
  run: () => void;
  cancel: () => void;
};

export function useTestPythonTransform(
  source: PythonTransformSourceDraft,
): TestPythonScriptState {
  const [
    executePython,
    { data = null, error, isLoading: isRunning, originalArgs },
  ] = useExecutePythonMutation();
  const abort = useRef<(() => void) | null>(null);

  const isDirty = originalArgs?.code !== source.body;

  const run = async () => {
    if (source["source-database"] === undefined) {
      return null;
    }

    const request = executePython({
      code: source.body,
      source_tables: source["source-tables"],
    });

    abort.current = () => request.abort();
  };

  const cancel = () => {
    abort.current?.();
  };

  const executionResult = {
    ...data,
    error: getError(error) ?? data?.error,
  };

  return {
    isRunning,
    isDirty,
    cancel,
    run,
    executionResult,
  };
}

function getError(error: unknown) {
  if (!error) {
    return null;
  }

  if (typeof error === "object" && error !== null) {
    if ("name" in error && error.name === "AbortError") {
      return { message: t`Python script execution was canceled` };
    }
  }
  return {
    message: getErrorMessage(error, t`An unknown error occurred`),
  };
}
