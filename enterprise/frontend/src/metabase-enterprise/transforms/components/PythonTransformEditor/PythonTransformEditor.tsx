import { useEffect, useState } from "react";

import { Flex, Stack } from "metabase/ui";
import type { PythonTransformSource } from "metabase-types/api";

import { PythonDataPicker } from "../PythonDataPicker";
import { EditorHeader } from "../QueryEditor/EditorHeader";
import { PythonQueryEditor } from "../QueryEditor/PythonQueryEditor";

type PythonTransformEditorProps = {
  initialSource: PythonTransformSource;
  isNew?: boolean;
  isSaving?: boolean;
  onSave: (newSource: PythonTransformSource) => void;
  onCancel: () => void;
  onSourceChange?: (newSource: PythonTransformSource) => void;
};

export function PythonTransformEditor({
  initialSource,
  isNew = true,
  isSaving = false,
  onSave,
  onCancel,
  onSourceChange,
}: PythonTransformEditorProps) {
  const [source, setSource] = useState(initialSource);
  const [isSourceDirty, setIsSourceDirty] = useState(false);

  useEffect(() => {
    if (onSourceChange) {
      onSourceChange(source);
    }
  }, [source, onSourceChange]);

  const handleScriptChange = (body: string) => {
    const newSource = {
      ...source,
      body,
    };
    setSource(newSource);
    setIsSourceDirty(true);
  };

  const updateTransformSignature = (
    script: string,
    tables: Record<string, { id: number; name: string }>,
  ): string => {
    const tableAliases = Object.keys(tables);

    const transformRegex = /^def\s+transform\s*\([^)]*\)\s*:\s*\n(\s*)/m;

    const signatureOneLine = `def transform(${tableAliases.join(", ")}):`;
    const newSignature =
      signatureOneLine.length > 80 && tableAliases.length > 0
        ? `def transform(\n${tableAliases.map((alias) => `    ${alias}`).join(",\n")},\n):`
        : signatureOneLine;

    if (transformRegex.test(script)) {
      // Capture the existing indentation after the colon
      const match = script.match(transformRegex);
      const originalIndent = match ? match[1] : "    ";

      let updatedScript = script.replace(
        transformRegex,
        newSignature + "\n" + originalIndent,
      );

      const argsRegex =
        /(\s+"""[\s\S]*?)\s*Args:\s*\n([\s\S]*?)\s*(\n\s+Returns:|\n\s+""")/;
      const argsMatch = updatedScript.match(argsRegex);

      if (tableAliases.length > 0) {
        const maxAliasLength = Math.max(...tableAliases.map((a) => a.length));
        const newArgsSection = tableAliases
          .map((alias) => {
            const padding = " ".repeat(maxAliasLength - alias.length);
            const tableName = tables[alias].name;
            if (alias === tableName) {
              return `        ${alias}:${padding} DataFrame containing the data from the corresponding table`;
            }
            return `        ${alias}:${padding} DataFrame containing the data from table "${tableName}"`;
          })
          .join("\n");

        if (argsMatch) {
          // Replace existing Args section
          updatedScript = updatedScript.replace(
            argsRegex,
            `    $1

    Args:
${newArgsSection}
$3`,
          );
        } else {
          // No Args section exists, look for the pattern before Returns and insert Args
          // Also remove the instructional text about selecting tables
          const insertRegex =
            /(\s+"""[\s\S]*?)\s*Select tables above to add them as function parameters\.\s*(\n\s+Returns:|\n\s+""")/;
          const insertMatch = updatedScript.match(insertRegex);
          if (insertMatch) {
            updatedScript = updatedScript.replace(
              insertRegex,
              `$1

    Args:
${newArgsSection}
$2`,
            );
          } else {
            // Fallback: just look for Returns section without the specific text
            // Remove any extra whitespace before Returns and ensure single blank line
            const fallbackRegex = /(\s+"""[\s\S]*?)\s*(\n\s+Returns:|\n\s+""")/;
            const fallbackMatch = updatedScript.match(fallbackRegex);
            if (fallbackMatch) {
              updatedScript = updatedScript.replace(
                fallbackRegex,
                `$1

    Args:
${newArgsSection}
$2`,
              );
            }
          }
        }
      } else if (argsMatch) {
        // Remove existing Args section when no tables
        updatedScript = updatedScript.replace(argsRegex, "$1$3");
      }

      return updatedScript;
    }

    const maxAliasLength =
      tableAliases.length > 0
        ? Math.max(...tableAliases.map((a) => a.length))
        : 0;
    const functionTemplate = `
${newSignature}
    """
    Transform function that processes the input data.
    ${
      tableAliases.length > 0
        ? `

    Args:
${tableAliases
  .map((alias) => {
    const padding = " ".repeat(maxAliasLength - alias.length);
    const tableName = tables[alias].name;
    if (alias === tableName) {
      return `        ${alias}:${padding} DataFrame containing the data from the corresponding table`;
    }
    return `        ${alias}:${padding} DataFrame containing the data from table "${tableName}"`;
  })
  .join("\n")}`
        : ""
    }

    Returns:
        DataFrame: The transformed data
    """
    import pandas as pd
    return pd.DataFrame()
`;

    return script + functionTemplate;
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
