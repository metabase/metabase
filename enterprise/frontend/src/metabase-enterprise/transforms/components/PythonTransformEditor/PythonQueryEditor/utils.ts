import { useRef, useState } from "react";
import { t } from "ttag";

import {
  type ExecutePythonResponse,
  useExecutePythonMutation,
} from "metabase-enterprise/transforms/api/python-runner";
import type { RowValue } from "metabase-types/api";

export type Row = Record<string, RowValue>;

export function parseOutput(output: string): {
  headers: string[];
  rows: Row[];
} {
  if (!output?.trim()) {
    return { headers: [], rows: [] };
  }

  const lines = output.trim().split("\n");
  const headers = new Set<string>();
  const rows: Row[] = [];

  for (const line of lines) {
    const data = JSON.parse(line) as Row;
    for (const key in data) {
      headers.add(key);
    }
    rows.push(data);
  }

  return {
    headers: Array.from(headers),
    rows,
  };
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

export function insertImport(source: string, path: string) {
  const lines = source.split("\n");

  // Find the first line that is not a comment
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().startsWith("#")) {
      continue;
    }
    lines.splice(i, 0, `import ${pathToImportSpecifier(path)}`);
    break;
  }

  return lines.join("\n");
}

function pathToImportSpecifier(path: string) {
  return path.replace(/\.py$/, "").split("/").join(".");
}

function libImportRegex(path: string) {
  return new RegExp(`import ${pathToImportSpecifier(path)}`, "g");
}

export function removeImport(source: string, path: string) {
  const lines = source.split("\n");
  return lines.filter((line) => !libImportRegex(path).test(line)).join("\n");
}

export function hasImport(source: string, path: string) {
  const regex = libImportRegex(path);
  return regex.test(source);
}
