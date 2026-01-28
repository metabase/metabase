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
import S from "./PythonTransformEditor.module.css";
import { PythonTransformTopBar } from "./PythonTransformTopBar";
import { useTestPythonTransform } from "./hooks";
import { updateTransformSignature } from "./utils";

export function PythonTransformEditor({
  source,
  proposedSource,
  isEditMode,
  transformId,
  onChangeSource,
  onAcceptProposed,
  onRejectProposed,
}: PythonTransformEditorProps) {
  const { isRunning, cancel, run, executionResult, isDirty } =
    useTestPythonTransform(source);

  const handleScriptChange = (body: string) => {
    const newSource = {
      ...source,
      body,
    };
    onChangeSource(newSource);
  };

  const handleDatabaseChange = (databaseId: DatabaseId) => {
    // Clear table selections when database changes
    const newSource = {
      ...source,
      "source-database": databaseId,
      "source-tables": {},
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
    if (!isEditMode) {
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
        isEditMode={isEditMode}
        transformId={transformId}
        onDatabaseChange={handleDatabaseChange}
      />
      <Flex className={S.editorBodyWrapper}>
        {isEditMode && (
          <PythonDataPicker
            database={source["source-database"]}
            tables={source["source-tables"]}
            onChange={handleDataChange}
          />
        )}
        <Stack w="100%" h="100%" gap={0}>
          <PythonEditorBody
            isRunnable={isPythonTransformSource(source)}
            isRunning={isRunning}
            isDirty={isDirty}
            isEditMode={isEditMode}
            onRun={run}
            onCancel={cancel}
            source={source.body}
            proposedSource={proposedSource?.body}
            onChange={handleScriptChange}
            withDebugger={isEditMode}
            onAcceptProposed={onAcceptProposed}
            onRejectProposed={onRejectProposed}
          />
          {isEditMode && (
            <PythonEditorResults
              isRunning={isRunning}
              executionResult={executionResult}
            />
          )}
        </Stack>
      </Flex>
    </Flex>
  );
}
