import { useHotkeys } from "@mantine/hooks";
import cx from "classnames";
import { useEffect } from "react";
import { usePrevious } from "react-use";

import type { PythonTransformEditorProps } from "metabase/plugins";
import { Box, Flex, Stack, Text } from "metabase/ui";
import {
  ADVANCED_TRANSFORM_TYPES,
  type DatabaseId,
  type PythonTransformTableAliases,
  type Table,
} from "metabase-types/api";

import { isPythonTransformSource } from "../../utils";

import { PythonDataPicker } from "./PythonDataPicker";
import { PythonEditorBody } from "./PythonEditorBody";
import { PythonEditorResults } from "./PythonEditorResults";
import S from "./PythonTransformEditor.module.css";
import { PythonTransformTopBar } from "./PythonTransformTopBar";
import { TransformTypeSelect } from "./TransformTypeSelect";
import { useTestPythonTransform } from "./hooks";
import { updateTransformSignature } from "./utils";

export function PythonTransformEditor({
  source,
  proposedSource,
  uiOptions,
  isEditMode,
  transform,
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
      source.type,
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
  const canChangeType = !transform?.id;

  return (
    <Flex h="100%" w="100%" direction="column">
      <PythonTransformTopBar
        databaseId={source["source-database"]}
        isEditMode={isEditMode}
        readOnly={uiOptions?.readOnly}
        transform={transform}
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
            type={source.type}
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
        {!!source?.type && (
          <Box className={cx(S.typeLabel, { [S.editMode]: isEditMode })}>
            {canChangeType ? (
              <TransformTypeSelect value={source.type} />
            ) : (
              <Text fz="sm" c="text-secondary" px="xs">
                {ADVANCED_TRANSFORM_TYPES[source.type].displayName}
              </Text>
            )}
          </Box>
        )}
      </Flex>
    </Flex>
  );
}
