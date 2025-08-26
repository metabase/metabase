import { useHotkeys } from "@mantine/hooks";
import { useState } from "react";

import { Flex } from "metabase/ui";
import type { TransformSource } from "metabase-types/api";

import { PythonDataPicker } from "../PythonDataPicker";
import { EditorHeader } from "../QueryEditor/EditorHeader";
import { PythonEditor } from "../QueryEditor/PythonEditor";

type PythonTransformEditorProps = {
  initialSource: TransformSource & { type: "python" };
  isNew?: boolean;
  isSaving?: boolean;
  onSave: (newSource: TransformSource & { type: "python" }) => void;
  onCancel: () => void;
};

export function PythonTransformEditor({
  initialSource,
  isNew = true,
  isSaving = false,
  onSave,
  onCancel,
}: PythonTransformEditorProps) {
  const [source, setSource] = useState(initialSource);
  const [isSourceDirty, setIsSourceDirty] = useState(false);
  const [isRunning, setIsRunning] = useState(false);

  const handleScriptChange = (body: string) => {
    const newSource = {
      ...source,
      body,
    };
    setSource(newSource);
    setIsSourceDirty(true);
  };

  const handleDataChange = (database: number, table?: number) => {
    const newSource = {
      ...source,
      database,
      table,
    };
    setSource(newSource);
    setIsSourceDirty(true);
  };

  const handleSave = () => {
    onSave(source);
  };

  const handleRunScript = async () => {
    setIsRunning(true);
    // TODO: Implement Python script execution
    // For now, just simulate running
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setIsRunning(false);
  };

  const handleCancelScript = () => {
    setIsRunning(false);
  };

  const handleCmdEnter = () => {
    if (isRunning) {
      handleCancelScript();
    } else {
      handleRunScript();
    }
  };

  useHotkeys([["mod+Enter", handleCmdEnter]], []);

  const canSave = Boolean(source.body.trim() && source["source-database"]);

  return (
    <Flex
      w="100%"
      h="100%"
      direction="column"
      bg="bg-white"
      data-testid="python-transform-editor"
    >
      <EditorHeader
        isNew={isNew}
        isSaving={isSaving}
        canSave={canSave && (isNew || isSourceDirty)}
        onSave={handleSave}
        onCancel={onCancel}
      />
      <Flex direction="column" style={{ flex: 1 }} p="md">
        <PythonDataPicker
          database={source["source-database"]}
          onChange={handleDataChange}
        />

        <Flex direction="column" style={{ flex: 1, marginTop: "1rem" }}>
          <PythonEditor
            script={source.body}
            isRunnable={true}
            isRunning={isRunning}
            isResultDirty={false}
            onChange={handleScriptChange}
            onRunScript={handleRunScript}
            onCancelScript={handleCancelScript}
          />
        </Flex>
      </Flex>
    </Flex>
  );
}
