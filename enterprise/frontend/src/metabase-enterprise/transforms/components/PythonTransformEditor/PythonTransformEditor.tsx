import { useHotkeys } from "@mantine/hooks";
import { useState } from "react";

import { NotFound } from "metabase/common/components/ErrorPages";
import { useHasTokenFeature } from "metabase/common/hooks";
import { Flex, Stack } from "metabase/ui";
import type {
  DatabaseId,
  PythonTransformSource,
  PythonTransformTableAliases,
  Table,
} from "metabase-types/api";

import { EditorHeader } from "../QueryEditor/EditorHeader";

import { PythonDataPicker } from "./PythonDataPicker";
import { PythonEditorBody } from "./PythonEditorBody";
import { PythonEditorResults } from "./PythonEditorResults";
import {
  isPythonTransformSource,
  updateTransformSignature,
  useTestPythonTransform,
} from "./utils";

export type PythonTransformSourceDraft = {
  type: "python";
  body: string;
  "source-database": DatabaseId | undefined;
  "source-tables": PythonTransformTableAliases;
};

type PythonTransformEditorProps = {
  initialSource: PythonTransformSourceDraft;
  isNew?: boolean;
  isSaving?: boolean;
  isRunnable?: boolean;
  onSave: (newSource: PythonTransformSource) => void;
  onCancel: () => void;
};

export function PythonTransformEditor({
  initialSource,
  isNew = true,
  isSaving = false,
  isRunnable = true,
  onSave,
  onCancel,
}: PythonTransformEditorProps) {
  const [source, setSource] = useState(initialSource);
  const [isSourceDirty, setIsSourceDirty] = useState(false);
  const hasPythonTransforms = useHasTokenFeature("transforms-python");

  const { isRunning, isDirty, cancel, run, executionResult } =
    useTestPythonTransform(source);

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
    if (isPythonTransformSource(source)) {
      onSave(source);
    }
  };

  const showDebugger =
    new URLSearchParams(window.location.search).get("debugger") === "1";

  const handleCmdEnter = () => {
    if (!showDebugger) {
      return;
    }
    if (isRunning) {
      cancel();
    } else if (isRunnable && isPythonTransformSource(source)) {
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

  if (!hasPythonTransforms) {
    return <NotFound />;
  }

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
              executionResult={executionResult}
            />
          )}
        </Stack>
      </Flex>
    </Stack>
  );
}
