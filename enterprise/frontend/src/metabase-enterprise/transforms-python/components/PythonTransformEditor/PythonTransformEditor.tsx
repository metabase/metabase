import { useHotkeys } from "@mantine/hooks";
import { useState } from "react";

import { Flex, Stack } from "metabase/ui";
import { EditorHeader } from "metabase-enterprise/transforms/components/QueryEditor/EditorHeader";
import { useTestPythonTransform } from "metabase-enterprise/transforms-python/hooks/use-test-python-transform";
import type {
  DatabaseId,
  PythonTransformSource,
  PythonTransformTableAliases,
  Table,
} from "metabase-types/api";

import { PythonDataPicker } from "./PythonDataPicker";
import { PythonEditorBody } from "./PythonEditorBody";
import { PythonEditorResults } from "./PythonEditorResults";
import {
  getValidationResult,
  isPythonTransformSource,
  updateTransformSignature,
} from "./utils";

export type PythonTransformSourceDraft = {
  type: "python";
  body: string;
  "source-database": DatabaseId | undefined;
  "source-tables": PythonTransformTableAliases;
};

export type PythonTransformEditorProps = {
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

  const handleCmdEnter = () => {
    if (isRunning) {
      cancel();
    } else if (isRunnable && isPythonTransformSource(source)) {
      run();
    }
  };

  useHotkeys([["mod+Enter", handleCmdEnter]], []);

  const validationResult = getValidationResult(source);

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
        onSave={handleSave}
        onCancel={onCancel}
        validationResult={validationResult}
        isQueryDirty={isSourceDirty}
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
            withDebugger
          />
          <PythonEditorResults
            isRunning={isRunning}
            executionResult={executionResult}
          />
        </Stack>
      </Flex>
    </Stack>
  );
}
