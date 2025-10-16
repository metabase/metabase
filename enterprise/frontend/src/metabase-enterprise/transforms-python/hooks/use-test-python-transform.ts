import { useCallback } from "react";

import type { RowValue } from "metabase-types/api";

import type { PythonTransformSourceDraft } from "../components/PythonTransformEditor";

import { type SampleData, useSampleData } from "./use-data-sample";
import { usePythonLibraries } from "./use-python-shared-libraries";
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

export type PythonTransformResultData = {
  cols: { name: string }[];
  rows: Record<string, RowValue>[];
};

export function useTestPythonTransformOnPyodide(
  source: PythonTransformSourceDraft,
) {
  const { fetchLibraries, isRunning: isFetchingLibraries } =
    usePythonLibraries();
  const { fetchSampleData, isRunning: isFetchingData } = useSampleData(source);
  const {
    isRunning: isRunningPython,
    cancel,
    data: executionResult,
    executePython,
  } = useRunPython<PythonTransformResultData>();

  const run = useCallback(async () => {
    const [sampleData, libraries] = await Promise.all([
      fetchSampleData(),
      fetchLibraries(),
    ]);

    const script = getPythonScript(source.body, sampleData);
    executePython(script, libraries);
  }, [source, executePython, fetchSampleData, fetchLibraries]);

  return {
    isRunning: isRunningPython || isFetchingData || isFetchingLibraries,
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
  const encoded = btoa(JSON.stringify(data));

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

  kwargs = {}
  for column in columns:
    kwargs[column['alias']] = pd.DataFrame(column['rows'])

  # run user-defined transform
  result = transform(**kwargs)

  if result is None:
    raise Exception('Transform function did not return a result')

  if not isinstance(result, pd.DataFrame):
    raise Exception('Transform function did not return a DataFrame')

  def as_column(name):
    return { 'name': name }

  cols = [{'name': name} for name in result.columns.tolist()]
  rows = result.to_dict('records')

  return json.dumps({
    'cols': cols,
    'rows': rows,
  })

__run_transform_${random}()
`,
  ].join("\n");
}
