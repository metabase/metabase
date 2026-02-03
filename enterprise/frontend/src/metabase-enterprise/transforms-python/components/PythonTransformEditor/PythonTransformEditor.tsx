import { useHotkeys } from "@mantine/hooks";
import { useEffect } from "react";
import { usePrevious } from "react-use";

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
  uiOptions,
  isEditMode,
<<<<<<< HEAD
  transform,
=======
  readOnly,
  transformId,
>>>>>>> master
  onChangeSource,
  onAcceptProposed,
  onRejectProposed,
  onRunTransform,
  onRun,
}: PythonTransformEditorProps) {
  const { isRunning, cancel, run, executionResult, isDirty } =
    useTestPythonTransform(source);

  const wasRunning = usePrevious(isRunning);

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

  const handleRun = () => {
    // Use custom onRun handler if provided (workspace dry-run), otherwise use internal test-run
    if (onRun) {
      onRun();
    } else {
      run();
    }
  };

  // Notify workspace when test-run completes in workspace context
  useEffect(() => {
    const runJustCompleted = wasRunning && !isRunning;
    if (
      runJustCompleted &&
      executionResult &&
      onRunTransform &&
      uiOptions?.hidePreview
    ) {
      onRunTransform(executionResult);
    }
  }, [
    wasRunning,
    isRunning,
    executionResult,
    onRunTransform,
    uiOptions?.hidePreview,
  ]);

  const handleCmdEnter = () => {
    if (!isEditMode) {
      return;
    }
    // In workspaces, disable run shortcut when transform has unsaved changes (hideRunButton)
    // if (uiOptions?.hideRunButton) {
    //   return;
    // }
    if (isRunning) {
      cancel();
    } else if (isPythonTransformSource(source)) {
      handleRun();
    }
  };

  useHotkeys([["mod+Enter", handleCmdEnter]], []);

  return (
    <Flex h="100%" w="100%" direction="column">
      <PythonTransformTopBar
        databaseId={source["source-database"]}
        isEditMode={isEditMode}
<<<<<<< HEAD
        transform={transform}
=======
        readOnly={readOnly}
        transformId={transformId}
>>>>>>> master
        onDatabaseChange={handleDatabaseChange}
        canChangeDatabase={uiOptions?.canChangeDatabase}
      />
      <Flex className={S.editorBodyWrapper}>
        {isEditMode && (
          <PythonDataPicker
            disabled={uiOptions?.readOnly}
            database={source["source-database"]}
            tables={source["source-tables"]}
            onChange={handleDataChange}
          />
        )}
        <Stack w="100%" h="100%" gap={0}>
          <PythonEditorBody
            disabled={uiOptions?.readOnly}
            isRunnable={isPythonTransformSource(source)}
            isRunning={isRunning}
            isDirty={isDirty}
            isEditMode={isEditMode}
            hideRunButton={uiOptions?.hideRunButton}
            onRun={handleRun}
            onCancel={cancel}
            source={source.body}
            proposedSource={proposedSource?.body}
            onChange={handleScriptChange}
            withDebugger={isEditMode && !uiOptions?.hidePreview}
            onAcceptProposed={onAcceptProposed}
            onRejectProposed={onRejectProposed}
          />
          {!uiOptions?.hidePreview && isEditMode && (
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
