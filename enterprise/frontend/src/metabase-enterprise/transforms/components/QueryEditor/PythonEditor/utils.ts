import { useRef, useState } from "react";
import { t } from "ttag";

import {
  type ExecutePythonResponse,
  useExecutePythonMutation,
} from "metabase-enterprise/transforms/api/python-runner";

export function parseCSV(csv: string): { headers: string[]; rows: string[][] } {
  if (!csv || !csv.trim()) {
    return { headers: [], rows: [] };
  }

  const lines = csv.trim().split("\n");
  if (lines.length === 0) {
    return { headers: [], rows: [] };
  }

  const headers = lines[0].split(",").map((h) => h.trim());
  const rows = lines.slice(1).map((line) => {
    return line.split(",").map((cell) => cell.trim());
  });

  return { headers, rows };
}

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

export function useTestPythonScript(
  code: string,
  tables: Record<string, number>,
): TestPythonScriptState {
  const [executePython, { isLoading: isRunning, originalArgs }] =
    useExecutePythonMutation();
  const abort = useRef<(() => void) | null>(null);
  const [executionResult, setData] = useState<ExecutePythonResponse | null>(
    null,
  );

  const isDirty = originalArgs?.code !== code;

  const run = async () => {
    const request = executePython({ code, tables });
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

        if ("message" in error && typeof error.message === "string") {
          setData({ error: error.message });
          return;
        }

        if (
          "data" in error &&
          typeof error.data === "object" &&
          error.data !== null &&
          "error" in error.data &&
          typeof error.data.error === "string"
        ) {
          setData({ error: error?.data?.error });
          return;
        }
      }

      setData({ error: t`An unknown error occurred` });
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
