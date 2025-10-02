import { useCallback, useRef, useState } from "react";
import { t } from "ttag";

import { getErrorMessage } from "metabase/api/utils";
import { useExecutePythonMutation } from "metabase-enterprise/api/transform-python";
import type {
  ExecutePythonTransformResponse,
  PythonTransformSource,
  PythonTransformTableAliases,
  Table,
  TableId,
} from "metabase-types/api";

import { DataFetcher } from "../../services/data-fetcher";
import { pyodideWorkerManager } from "../../services/pyodide-worker-manager";

import type { PythonTransformSourceDraft } from "./PythonTransformEditor";

export function updateTransformSignature(
  script: string,
  tables: PythonTransformTableAliases,
  tableInfo: Table[],
): string {
  const tableAliases = Object.keys(tables);

  const transformRegex = /^def\s+transform\s*\([^)]*\)\s*:\s*\n(\s*)/m;

  const signatureOneLine = `def transform(${tableAliases.join(", ")}):`;
  const newSignature =
    signatureOneLine.length > 80 && tableAliases.length > 0
      ? `def transform(\n${tableAliases.map((alias) => `    ${alias}`).join(",\n")},\n):`
      : signatureOneLine;

  function getTableName(tableId: TableId) {
    const table = tableInfo.find((t) => t.id === tableId);
    if (!table) {
      return undefined;
    }
    return [table.db?.name, table.schema, table.name].filter(Boolean).join(".");
  }

  if (transformRegex.test(script)) {
    // Capture the existing indentation after the colon
    const match = script.match(transformRegex);
    const originalIndent = match ? match[1] : "    ";

    let updatedScript = script.replace(
      transformRegex,
      newSignature + "\n" + originalIndent,
    );

    const argsRegex =
      /(\s+"""[\s\S]*?)\s*Args:\s*\n([\s\S]*?)\s*(\n\s+Returns:|\n\s+""")/;
    const argsMatch = updatedScript.match(argsRegex);

    if (tableAliases.length > 0) {
      const maxAliasLength = Math.max(...tableAliases.map((a) => a.length));
      const newArgsSection = tableAliases
        .map((alias) => {
          const padding = " ".repeat(maxAliasLength - alias.length);
          const tableId = tables[alias];
          const tableName = getTableName(tableId);
          return `        ${alias}:${padding} DataFrame containing the data from the "${tableName}" table`;
        })
        .join("\n");

      if (argsMatch) {
        // Replace existing Args section
        updatedScript = updatedScript.replace(
          argsRegex,
          `    $1

    Args:
${newArgsSection}
$3`,
        );
      } else {
        // No Args section exists, look for the pattern before Returns and insert Args
        // Also remove the instructional text about selecting tables
        const insertRegex =
          /(\s+"""[\s\S]*?)\s*Select tables above to add them as function parameters\.\s*(\n\s+Returns:|\n\s+""")/;
        const insertMatch = updatedScript.match(insertRegex);
        if (insertMatch) {
          updatedScript = updatedScript.replace(
            insertRegex,
            `$1

    Args:
${newArgsSection}
$2`,
          );
        } else {
          // Fallback: just look for Returns section without the specific text
          // Remove any extra whitespace before Returns and ensure single blank line
          const fallbackRegex = /(\s+"""[\s\S]*?)\s*(\n\s+Returns:|\n\s+""")/;
          const fallbackMatch = updatedScript.match(fallbackRegex);
          if (fallbackMatch) {
            updatedScript = updatedScript.replace(
              fallbackRegex,
              `$1

    Args:
${newArgsSection}
$2`,
            );
          }
        }
      }
    } else if (argsMatch) {
      // Remove existing Args section when no tables
      updatedScript = updatedScript.replace(argsRegex, "$1$3");
    }

    return updatedScript;
  }

  const maxAliasLength =
    tableAliases.length > 0
      ? Math.max(...tableAliases.map((a) => a.length))
      : 0;
  const functionTemplate = `
${newSignature}
    """
    Transform function that processes the input data.
    ${
      tableAliases.length > 0
        ? `

    Args:
${tableAliases
  .map((alias) => {
    const padding = " ".repeat(maxAliasLength - alias.length);
    const tableId = tables[alias];
    const tableName = getTableName(tableId);
    if (alias === tableName) {
      return `        ${alias}:${padding} DataFrame containing the data from the corresponding table`;
    }
    return `        ${alias}:${padding} DataFrame containing the data from table "${tableName}"`;
  })
  .join("\n")}`
        : ""
    }

    Returns:
        DataFrame: The transformed data
    """
    import pandas as pd
    return pd.DataFrame()
`;

  return script + functionTemplate;
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

export function useTestPythonTransform(
  source: PythonTransformSourceDraft,
): TestPythonScriptState {
  const [executePython, { isLoading: isBackendRunning, originalArgs }] =
    useExecutePythonMutation();
  const abort = useRef<(() => void) | null>(null);
  const [executionResult, setData] =
    useState<ExecutePythonTransformResponse | null>(null);
  const [isPyodideRunning, setIsPyodideRunning] = useState(false);

  const isRunning = isBackendRunning || isPyodideRunning;
  const isDirty = originalArgs?.code !== source.body;

  const runWithPyodide = useCallback(async () => {
    if (source["source-database"] === undefined) {
      setData({ error: t`Please select a source database` });
      return;
    }

    setIsPyodideRunning(true);

    try {
      // Fetch data for each table
      const tableEntries = Object.entries(source["source-tables"]);
      const sourcesPromises = tableEntries.map(
        async ([variableName, tableId]) => {
          // Fetch table metadata to get the actual table name and schema
          const tableResponse = await fetch(`/api/table/${tableId}`);
          const tableData = await tableResponse.json();

          // Fetch 1 row of data
          const transformSource = await DataFetcher.fetchTableData({
            databaseId: source["source-database"] as number,
            tableName: tableData.name,
            schemaName: tableData.schema,
            limit: 1,
          });

          return {
            ...transformSource,
            variable_name: variableName,
            database_id: source["source-database"] as number,
          };
        },
      );

      const sources = await Promise.all(sourcesPromises);

      // Get shared library code if available
      let _sharedLibrary = "";
      try {
        const libResponse = await fetch("/api/ee/transforms-python/library");
        if (libResponse.ok) {
          const libData = await libResponse.json();
          _sharedLibrary = libData.body || "";
        }
      } catch (error) {
        console.warn("Failed to fetch shared library:", error);
      }

      // Execute with Pyodide Web Worker
      const result = await pyodideWorkerManager.executePython(
        source.body,
        sources,
      );

      setData(result);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : t`An unknown error occurred`;
      setData({ error: errorMessage });
    } finally {
      setIsPyodideRunning(false);
    }
  }, [source]);

  const _runWithBackend = useCallback(async () => {
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
  }, [source, executePython]);

  const run = async () => {
    // Use Pyodide for preview instead of backend
    // Comment out the backend call but keep the code
    // await runWithBackend();
    await runWithPyodide();
  };

  const cancel = () => {
    if (isPyodideRunning) {
      // Cancel is handled automatically by the worker
      setIsPyodideRunning(false);
    } else {
      abort.current?.();
    }
  };

  return {
    isRunning,
    isDirty,
    cancel,
    run,
    executionResult,
  };
}

export function isPythonTransformSource(
  source: PythonTransformSourceDraft,
): source is PythonTransformSource {
  return source.type === "python" && source["source-database"] !== undefined;
}

export function getValidationResult(source: PythonTransformSourceDraft) {
  if (!source["source-database"]) {
    return { isValid: false, errorMessage: t`Select a source a database` };
  }

  if (source.body.trim() === "") {
    return {
      isValid: false,
      errorMessage: t`The Python script cannot be empty`,
    };
  }

  if (Object.keys(source["source-tables"]).length === 0) {
    return {
      isValid: false,
      errorMessage: t`Select at least one table to alias`,
    };
  }

  return { isValid: true };
}
