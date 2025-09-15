import { useState } from "react";

import { Flex, Stack } from "metabase/ui";
import type { PythonTransformSource } from "metabase-types/api";

import { PythonDataPicker } from "../PythonDataPicker";
import { EditorHeader } from "../QueryEditor/EditorHeader";
import { PythonQueryEditor } from "../QueryEditor/PythonQueryEditor";

import { updateTransformSignature } from "./utils";

type PythonTransformEditorProps = {
  initialSource: PythonTransformSource;
  isNew?: boolean;
  isSaving?: boolean;
  onSave: (newSource: PythonTransformSource) => void;
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
      data-testid="python-transform-editor"
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

        <PythonQueryEditor
          script={source.body}
          isRunnable={true}
          onChange={handleScriptChange}
          tables={source["source-tables"]}
        />
      </Flex>
    </Stack>
  );
}
