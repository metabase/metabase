import { useHotkeys } from "@mantine/hooks";
import { useState } from "react";

import { Flex, Stack } from "metabase/ui";
import { EditorHeader } from "metabase-enterprise/transforms/components/QueryEditor/EditorHeader";
import { useRegisterMetabotTransformContext } from "metabase-enterprise/transforms/hooks/use-register-transform-metabot-context";
import type {
  PythonTransformSource,
  PythonTransformSourceDraft,
  PythonTransformTableAliases,
  Table,
  Transform,
} from "metabase-types/api";

import { PythonDataPicker } from "./PythonDataPicker";
import { PythonEditorBody } from "./PythonEditorBody";
import { PythonEditorResults } from "./PythonEditorResults";
import {
  getValidationResult,
  isPythonTransformSource,
  updateTransformSignature,
  useShouldShowPythonDebugger,
  useTestPythonTransform,
} from "./utils";

export type PythonTransformEditorProps = {
  transform?: Transform | undefined;
  initialSource: PythonTransformSourceDraft;
  proposedSource?: PythonTransformSource;
  isNew?: boolean;
  isSaving?: boolean;
  isRunnable?: boolean;
  onChange?: (newSource: PythonTransformSourceDraft) => void;
  onSave: (newSource: PythonTransformSource) => void;
  onCancel: () => void;
  onRejectProposed?: () => void;
  onAcceptProposed?: (query: PythonTransformSource) => void;
};

export function PythonTransformEditor({
  transform,
  initialSource,
  proposedSource,
  isNew = true,
  isSaving = false,
  isRunnable = true,
  onChange,
  onSave,
  onCancel,
  onRejectProposed,
  onAcceptProposed,
}: PythonTransformEditorProps) {
  const [source, setSource] = useState(initialSource);
  const saveSource = proposedSource ?? source;
  const [isSourceDirty, setIsSourceDirty] = useState(false);

  useRegisterMetabotTransformContext(transform, proposedSource ?? source);

  const { isRunning, isDirty, cancel, run, executionResult } =
    useTestPythonTransform(source);

  const handleScriptChange = (body: string) => {
    const newSource = {
      ...source,
      body,
    };
    setSource(newSource);
    setIsSourceDirty(true);
    onChange?.(newSource);
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
    setSource(newSource);
    setIsSourceDirty(true);
  };

  const handleSave = () => {
    if (isPythonTransformSource(saveSource)) {
      onSave(saveSource);
    }
  };

  const handleAcceptProposed =
    proposedSource && onAcceptProposed
      ? () => {
          setSource(proposedSource);
          setIsSourceDirty(true);
          onAcceptProposed(proposedSource);
        }
      : undefined;

  const showDebugger = useShouldShowPythonDebugger();

  const handleCmdEnter = () => {
    if (!showDebugger) {
      return;
    }
    if (isRunning) {
      cancel();
    } else if (isRunnable && isPythonTransformSource(saveSource)) {
      run();
    }
  };

  useHotkeys([["mod+Enter", handleCmdEnter]], []);

  const validationResult = getValidationResult(saveSource);

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
        hasProposedQuery={!!proposedSource}
        onSave={handleSave}
        onCancel={onCancel}
        validationResult={validationResult}
        isQueryDirty={isSourceDirty}
      />
      <Stack h="100%" w="100%">
        <PythonDataPicker
          database={saveSource["source-database"]}
          tables={saveSource["source-tables"]}
          onChange={handleDataChange}
        />
        <PythonEditorBody
          isRunnable={isRunnable && isPythonTransformSource(source)}
          isRunning={isRunning}
          isDirty={isDirty}
          onRun={run}
          onCancel={cancel}
          source={source.body}
          onChange={handleScriptChange}
          withDebugger={showDebugger}
          />
        {showDebugger && (
          <PythonEditorResults
            isRunning={isRunning}
            isDirty={isDirty}
            onRun={run}
            onCancel={cancel}
            source={source.body}
            proposedSource={proposedSource?.body}
            onChange={handleScriptChange}
            withDebugger={showDebugger}
            onAcceptProposed={handleAcceptProposed}
            onRejectProposed={onRejectProposed}
          />
        )}
      </Stack>
    </Stack>
  );
}
