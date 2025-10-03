import { useCallback } from "react";

import type { RowValue } from "metabase-types/api";

import type { PythonTransformSourceDraft } from "../components/PythonTransformEditor";
import { DataFetcher } from "../services/data-fetcher";

import { useRunPython } from "./use-run-python";

type TransformData = {
  columns: string[];
  data: Record<string, RowValue>[];
};

export function useTestPythonTransform(source: PythonTransformSourceDraft) {
  const {
    isRunning,
    cancel,
    data: executionResult,
    executePython,
  } = useRunPython<TransformData>(["numpy", "pandas"]);

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
    executionResult,
  };
}
