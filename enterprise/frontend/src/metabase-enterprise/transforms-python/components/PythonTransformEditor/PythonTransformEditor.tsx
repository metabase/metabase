import { useHotkeys } from "@mantine/hooks";

import type { PythonTransformEditorProps } from "metabase/plugins";
import { Flex, Stack } from "metabase/ui";
import type {
  DatabaseId,
  PythonTransformTableAliases,
  Table,
} from "metabase-types/api";

import { isPythonTransformSource } from "../../utils";

import { PythonDataPicker } from "./PythonDataPicker";
import { PythonEditorBody } from "./PythonEditorBody";
import { PythonEditorResults } from "./PythonEditorResults";
import { useTestPythonTransform } from "./hooks";
import { updateTransformSignature } from "./utils";

export function PythonTransformEditor({
  source,
  proposedSource,
  uiOptions,
  isDirty,
  onChangeSource,
  onAcceptProposed,
  onRejectProposed,
}: PythonTransformEditorProps) {
  const { isRunning, cancel, run, executionResult } =
    useTestPythonTransform(source);

  const handleScriptChange = (body: string) => {
    const newSource = {
      ...source,
      body,
    };
    onChangeSource(newSource);
  };

  const handleDataChange = (
    database: DatabaseId,
    sourceTables: PythonTransformTableAliases,
    tableInfo: Table[],
  ) => {
    const updatedScript = updateTransformSignature(
      source.body,
      sourceTables,
      tableInfo,
    );

    const newSource = {
      ...source,
      body: updatedScript,
      "source-database": database,
      "source-tables": sourceTables,
    };
    onChangeSource(newSource);
  };

  const handleCmdEnter = () => {
    if (isRunning) {
      cancel();
    } else if (isPythonTransformSource(source)) {
      run();
    }
  };

  useHotkeys([["mod+Enter", handleCmdEnter]], []);

  return (
    <Flex h="100%" w="100%">
      <PythonDataPicker
        disabled={uiOptions?.readOnly}
        database={source["source-database"]}
        canChangeDatabase={uiOptions?.canChangeDatabase}
        tables={source["source-tables"]}
        onChange={handleDataChange}
      />
      <Stack w="100%" h="100%" gap={0}>
        <PythonEditorBody
          disabled={uiOptions?.readOnly}
          isRunnable={isPythonTransformSource(source)}
          isRunning={isRunning}
          isDirty={isDirty}
          onRun={run}
          onCancel={cancel}
          source={source.body}
          proposedSource={proposedSource?.body}
          onChange={handleScriptChange}
          withDebugger={!uiOptions?.hidePreview}
          onAcceptProposed={onAcceptProposed}
          onRejectProposed={onRejectProposed}
        />
        {!uiOptions?.hidePreview && (
          <PythonEditorResults
            isRunning={isRunning}
            executionResult={executionResult}
          />
        )}
      </Stack>
    </Flex>
  );
}
