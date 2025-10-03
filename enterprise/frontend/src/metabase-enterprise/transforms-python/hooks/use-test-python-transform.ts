import { useCallback } from "react";

import type { RowValue } from "metabase-types/api";

import type { PythonTransformSourceDraft } from "../components/PythonTransformEditor";
import { DataFetcher } from "../services/data-fetcher";

import { useRunPython } from "./use-run-python";

export type PyodideTableSource = {
  database_id: number;
  variable_name: string;
  columns: {
    name: string;
    type: string;
  }[];
  rows: Record<string, RowValue>[];
};

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

    executePython(getPythonScript(source.body, sources));
  }, [source, executePython]);

  return {
    isRunning,
    isDirty: true,
    cancel,
    run,
    executionResult,
  };
}

function getPythonScript(code: string, sources: PyodideTableSource[]) {
  // add a random suffix to the main function to avoid it
  // from being used in the transform function which would lead to
  // unexpected results.
  const random = Math.random().toString(36).slice(2);

  // Encode the columns as base64 JSON to avoid issues with escaping and formatting
  const encoded = btoa(JSON.stringify(sources.map((source) => source.rows)));

  return [
    // code should sit at the top of the script, so line numbers in errors
    // are correct
    code,
    `
def __run_transform_${random}():
  import json
  import base64

  if 'transform' not in globals():
    raise Exception('No transform function defined')

  encoded = '${encoded}'
  columns = json.loads(
    base64.b64decode(encoded)
  )

  # run user-defind transform
  result = transform(*columns)

  if result is None:
    raise Exception('Transform function did not return a result')

  if not isinstance(result, pd.DataFrame):
    raise Exception('Transform function did not return a DataFrame')

  return json.dumps({
    'columns': result.columns.tolist(),
    'data': result.to_dict('records')
  })

__run_transform_${random}()
`,
  ].join("\n");
}
