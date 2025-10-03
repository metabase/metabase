import { useCallback } from "react";

import type { RowValue } from "metabase-types/api";

import type { PythonTransformSourceDraft } from "../components/PythonTransformEditor";

import { type SampleData, useSampleData } from "./use-data-sample";
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
  const { fetchSampleData, isRunning: isFetchingData } = useSampleData(source);
  const {
    isRunning: isRunningPython,
    cancel,
    data: executionResult,
    executePython,
  } = useRunPython<TransformData>(["numpy", "pandas"]);

  const run = useCallback(async () => {
    const sampleData = await fetchSampleData();
    executePython(getPythonScript(source.body, sampleData));
  }, [source, executePython, fetchSampleData]);

  return {
    isRunning: isRunningPython || isFetchingData,
    isDirty: true,
    cancel,
    run,
    executionResult,
  };
}

function getPythonScript(code: string, data: SampleData[]) {
  // add a random suffix to the main function to avoid it
  // from being used in the transform function which would lead to
  // unexpected results.
  const random = Math.random().toString(36).slice(2);

  // Encode the columns as base64 JSON to avoid issues with escaping and formatting
  const encoded = btoa(JSON.stringify(data.map((source) => source.rows)));

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
