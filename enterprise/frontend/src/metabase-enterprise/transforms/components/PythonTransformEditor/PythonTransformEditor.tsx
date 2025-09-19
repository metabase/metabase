import { useHotkeys } from "@mantine/hooks";
import { useState } from "react";

import { Flex, Stack } from "metabase/ui";
import type { PythonTransformSource } from "metabase-types/api";

import { EditorHeader } from "../QueryEditor/EditorHeader";

import { PythonDataPicker } from "./PythonDataPicker";
import { PythonEditorBody } from "./PythonEditorBody";
import { PythonEditorResults } from "./PythonEditorResults";
import { updateTransformSignature, useTestPythonTransform } from "./utils";

type PythonTransformEditorProps = {
  initialSource: PythonTransformSource;
  proposedSource?: PythonTransformSource;
  isNew?: boolean;
  isSaving?: boolean;
  isRunnable?: boolean;
  onSave: (newSource: PythonTransformSource) => void;
  onCancel: () => void;
  onAcceptProposed?: (source: PythonTransformSource) => void;
  onRejectProposed?: () => void;
};

export function PythonTransformEditor({
  initialSource,
  proposedSource,
  isNew = true,
  isSaving = false,
  isRunnable = true,
  onSave,
  onCancel,
  onAcceptProposed,
  onRejectProposed,
}: PythonTransformEditorProps) {
  const [source, setSource] = useState(initialSource);
  const [isSourceDirty, setIsSourceDirty] = useState(false);

  const { isRunning, isDirty, cancel, run, executionResult } =
    useTestPythonTransform(source, proposedSource);

  const handleScriptChange = (body: string) => {
    const newSource = {
      ...source,
      body,
    };
    setSource(newSource);
    setIsSourceDirty(true);
  };

  const handleDataChange = (
    database: number,
    tables: Record<string, { id: number; name: string }>,
  ) => {
    const updatedScript = updateTransformSignature(source.body, tables);

    const sourceTables: Record<string, number> = {};
    Object.entries(tables).forEach(([alias, tableInfo]) => {
      sourceTables[alias] = tableInfo.id;
    });

    const newSource = {
      ...source,
      body: updatedScript,
      "source-database": database,
      "source-tables": sourceTables,
    };
    setSource(newSource);
    setIsSourceDirty(true);
  };

  const handleSave = () => {
    onSave(source);
  };

  const showDebugger =
    !!true || // TODO: below logic doesn't seem right?
    new URLSearchParams(window.location.search).get("debugger") === "1";

  const handleCmdEnter = () => {
    if (!showDebugger) {
      return;
    }
    if (isRunning) {
      cancel();
    } else if (isRunnable) {
      run();
    }
  };

  useHotkeys([["mod+Enter", handleCmdEnter]], []);

  const canSave = Boolean(
    source.body.trim() &&
      source["source-database"] &&
      source["source-tables"] &&
      Object.keys(source["source-tables"]).length > 0,
  );

  return (
    <Stack
      w="100%"
      h="100%"
      bg="bg-white"
      data-testid="transform-query-editor"
      gap={0}
    >
      <EditorHeader
        isNew={isNew}
        isSaving={isSaving}
        canSave={canSave && (isNew || isSourceDirty)}
        onSave={handleSave}
        onCancel={onCancel}
      />
      <Flex h="100%" w="100%">
        <PythonDataPicker
          database={source["source-database"]}
          tables={source["source-tables"]}
          onChange={handleDataChange}
        />
        <Stack w="100%" h="100%" gap={0}>
          <PythonEditorBody
            isRunnable={isRunnable}
            isRunning={isRunning}
            isDirty={isDirty}
            onRun={run}
            onCancel={cancel}
            source={source.body}
            proposedSource={proposedSource?.body}
            onChange={handleScriptChange}
            withDebugger={showDebugger}
            onAcceptProposed={
              proposedSource && onAcceptProposed
                ? () => {
                    handleScriptChange(proposedSource.body);
                    onAcceptProposed(proposedSource);
                  }
                : undefined
            }
            onRejectProposed={onRejectProposed}
          />
          {showDebugger && (
            <PythonEditorResults
              isRunning={isRunning}
              executionResult={executionResult}
            />
          )}
        </Stack>
      </Flex>
    </Stack>
  );
}
