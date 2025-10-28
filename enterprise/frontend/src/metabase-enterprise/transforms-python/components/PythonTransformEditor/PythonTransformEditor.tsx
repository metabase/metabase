import { useHotkeys } from "@mantine/hooks";

import type { PythonTransformEditorProps } from "metabase/plugins";
import { Flex, Stack } from "metabase/ui";
import { TransformHeader } from "metabase-enterprise/transforms/components/TransformHeader";
import { TransformMoreMenuWithModal } from "metabase-enterprise/transforms/components/TransformMoreMenu";
import type { PythonTransformTableAliases, Table } from "metabase-types/api";

import { PythonDataPicker } from "./PythonDataPicker";
import { PythonEditorActions } from "./PythonEditorActions";
import { PythonEditorBody } from "./PythonEditorBody";
import { PythonEditorResults } from "./PythonEditorResults";
import S from "./PythonTransformEditor.module.css";
import {
  updateTransformSignature,
  useShouldShowPythonDebugger,
  useTestPythonTransform,
} from "./utils";

export function PythonTransformEditor({
  id,
  name,
  source,
  proposedSource,
  isSaving,
  isSourceDirty,
  onNameChange,
  onSourceChange,
  onSave,
  onCancel,
  onAcceptProposed,
  onRejectProposed,
}: PythonTransformEditorProps) {
  const { isRunning, isDirty, cancel, run, executionResult } =
    useTestPythonTransform(source);

  const handleScriptChange = (body: string) => {
    const newSource = {
      ...source,
      body,
    };
    onSourceChange(newSource);
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
    onSourceChange(newSource);
  };

  const showDebugger = useShouldShowPythonDebugger();

  const handleCmdEnter = () => {
    if (!showDebugger) {
      return;
    }
    if (isRunning) {
      cancel();
    } else {
      run();
    }
  };

  useHotkeys([["mod+Enter", handleCmdEnter]], []);

  return (
    <Stack
      w="100%"
      h="100%"
      bg="bg-white"
      data-testid="transform-query-editor"
      gap={0}
    >
      <TransformHeader
        id={id}
        name={name}
        actions={
          isSaving || isSourceDirty ? (
            <PythonEditorActions
              source={source}
              isSaving={isSaving}
              onSave={onSave}
              onCancel={onCancel}
            />
          ) : id != null ? (
            <TransformMoreMenuWithModal transformId={id} />
          ) : null
        }
        onNameChange={onNameChange}
      />
      <Flex className={S.main}>
        <PythonDataPicker
          database={source["source-database"]}
          tables={source["source-tables"]}
          onChange={handleDataChange}
        />
        <PythonEditorBody
          isRunnable
          isRunning={isRunning}
          isDirty={isDirty}
          onRun={run}
          onCancel={cancel}
          source={source.body}
          proposedSource={proposedSource?.body}
          onChange={handleScriptChange}
          withDebugger={showDebugger}
          onAcceptProposed={onAcceptProposed}
          onRejectProposed={onRejectProposed}
        />
      </Flex>
      {showDebugger && (
        <PythonEditorResults
          isRunning={isRunning}
          executionResult={executionResult}
        />
      )}
    </Stack>
  );
}
