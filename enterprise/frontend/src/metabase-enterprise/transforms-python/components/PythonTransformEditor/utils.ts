import { useCallback } from "react";
import { t } from "ttag";

import { useRunPython } from "metabase-enterprise/transforms-python/hooks/use-run-python";
import type {
  PythonTransformSource,
  PythonTransformTableAliases,
  RowValue,
  Table,
  TableId,
} from "metabase-types/api";

import { DataFetcher } from "../../services/data-fetcher";
import type { PythonExecutionResult } from "../../services/pyodide-worker-pool";

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

type TransformData = {
  columns: string[];
  data: Record<string, RowValue>[];
};

type TestPythonScriptState = {
  isRunning: boolean;
  isDirty: boolean;
  executionResult: PythonExecutionResult<TransformData> | null;
  run: () => void;
  cancel: () => void;
};

export function useTestPythonTransform(
  source: PythonTransformSourceDraft,
): TestPythonScriptState {
  const { isRunning, cancel, data, executePython } =
    useRunPython<TransformData>(["numpy", "pandas"]);

  const run = useCallback(async () => {
    // Fetch data for each table
    const sources = await Promise.all(
      Object.entries(source["source-tables"]).map(
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
      ),
    );

    executePython(source.body, sources);
  }, [source, executePython]);

  return {
    isRunning,
    isDirty: true,
    cancel,
    run,
    executionResult: data,
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
