import { useHotkeys } from "@mantine/hooks";
import { useState } from "react";

import type { PythonTransformEditorProps } from "metabase/plugins";
import { Flex, Stack } from "metabase/ui";
import { EditorHeader } from "metabase-enterprise/transforms/components/TransformEditor/EditorHeader";
import type { PythonTransformTableAliases, Table } from "metabase-types/api";

import { PythonDataPicker } from "./PythonDataPicker";
import { PythonEditorBody } from "./PythonEditorBody";
import { PythonEditorResults } from "./PythonEditorResults";
import { useTestPythonTransform } from "./hooks";
import {
  getValidationResult,
  isPythonTransformSource,
  updateTransformSignature,
} from "./utils";

export function PythonTransformEditor({
  name,
  source,
  proposedSource,
  isNew = false,
  isDirty = false,
  isSaving = false,
  onChangeSource,
  onSave,
  onCancel,
  onAcceptProposed,
  onRejectProposed,
}: PythonTransformEditorProps) {
  const [testRunner, setTestRunner] = useState<"pyodide" | "api">("pyodide");
  const { isRunning, cancel, run, executionResult } =
    useTestPythonTransform(source, testRunner);

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
    if (isRunning) {
      cancel();
    } else if (isPythonTransformSource(source)) {
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
        name={name}
        validationResult={validationResult}
        isNew={isNew}
        isDirty={isDirty}
        isSaving={isSaving}
        onSave={onSave}
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
            isRunnable={isPythonTransformSource(source)}
            isRunning={isRunning}
            isDirty
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
            testRunner={testRunner}
            onTestRunnerChange={setTestRunner}
          />
        </Stack>
      </Flex>
    </Stack>
  );
}
