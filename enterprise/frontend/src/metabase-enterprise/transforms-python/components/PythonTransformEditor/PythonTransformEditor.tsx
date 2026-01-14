import { useHotkeys } from "@mantine/hooks";

import type { PythonTransformEditorProps } from "metabase/plugins";
import { Flex, Stack } from "metabase/ui";
import type { PythonTransformTableAliases, Table } from "metabase-types/api";

import { isPythonTransformSource } from "../../utils";

import { PythonDataPicker } from "./PythonDataPicker";
import { PythonEditorBody } from "./PythonEditorBody";
import { PythonEditorResults } from "./PythonEditorResults";
import { PythonTransformTopBar } from "./PythonTransformTopBar";
import { useTestPythonTransform } from "./hooks";
import { updateTransformSignature } from "./utils";

export function PythonTransformEditor({
  source,
  proposedSource,
  isDirty,
  readOnly,
  transformId,
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
    database: number,
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
    if (readOnly) {
      return;
    }
    if (isRunning) {
      cancel();
    } else if (isPythonTransformSource(source)) {
      run();
    }
  };

  useHotkeys([["mod+Enter", handleCmdEnter]], []);

  return (
    <Flex h="100%" w="100%" direction="column">
      <PythonTransformTopBar
        databaseId={source["source-database"]}
        readOnly={readOnly}
        transformId={transformId}
      />
      <Flex h="100%" w="100%" style={{ minHeight: 0 }}>
        <PythonDataPicker
          database={source["source-database"]}
          tables={source["source-tables"]}
          onChange={handleDataChange}
          readOnly={readOnly}
        />
        <Stack w="100%" h="100%" gap={0}>
          <PythonEditorBody
            isRunnable={isPythonTransformSource(source)}
            isRunning={isRunning}
            isDirty={isDirty}
            readOnly={readOnly}
            onRun={run}
            onCancel={cancel}
            source={source.body}
            proposedSource={proposedSource?.body}
            onChange={handleScriptChange}
            withDebugger
            onAcceptProposed={onAcceptProposed}
            onRejectProposed={onRejectProposed}
          />
          <PythonEditorResults
            isRunning={isRunning}
            executionResult={executionResult}
          />
        </Stack>
      </Flex>
    </Flex>
  );
}
