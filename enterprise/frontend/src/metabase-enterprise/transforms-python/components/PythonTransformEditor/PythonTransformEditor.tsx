import { useHotkeys } from "@mantine/hooks";
import { useEffect } from "react";
import { usePrevious } from "react-use";

import type { PythonTransformEditorProps } from "metabase/plugins";
import {
  INGESTION_PYTHON_BODY,
  STARTER_PYTHON_BODY,
} from "metabase/transforms/constants";
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
import { setIngestionSignature, updateTransformSignature } from "./utils";

export function PythonTransformEditor({
  source,
  proposedSource,
  uiOptions,
  isEditMode,
  transform,
  onChangeSource,
  onAcceptProposed,
  onRejectProposed,
  onDryRunErrorChange,
  onRunTransform,
  onRun,
}: PythonTransformEditorProps) {
  const { isRunning, cancel, run, executionResult, isDirty } =
    useTestPythonTransform(source, transform?.id);

  useEffect(() => {
    const errMsg = [executionResult?.error?.message, executionResult?.logs]
      .filter((x) => !!x)
      .join("\n\n");
    onDryRunErrorChange?.(errMsg);
    return () => onDryRunErrorChange?.(undefined);
  }, [executionResult, onDryRunErrorChange]);

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
      "source-tables": [],
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

  // The backend rejects an ingestion transform that also has source tables, so turning the
  // toggle on drops the selections (and the parameters they added to the script signature).
  const handleIngestionChange = (isIngestion: boolean) => {
    // An untouched template is swapped for the other one; a script the user has written keeps its
    // body and only has its signature adapted.
    const isUntouched = (template: string) =>
      source.body.trim() === template.trim();

    if (!isIngestion) {
      onChangeSource({
        ...source,
        ingestion: false,
        body: isUntouched(INGESTION_PYTHON_BODY)
          ? STARTER_PYTHON_BODY
          : updateTransformSignature(source.body, [], []),
      });
      return;
    }

    onChangeSource({
      ...source,
      ingestion: true,
      "source-tables": [],
      body: isUntouched(STARTER_PYTHON_BODY)
        ? INGESTION_PYTHON_BODY
        : setIngestionSignature(source.body),
    });
  };

  const handleRun = () => {
    if (onRun) {
      onRun();
    } else {
      run();
    }
  };

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
            isIngestion={source.ingestion ?? false}
            onChange={handleDataChange}
            onIngestionChange={handleIngestionChange}
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
