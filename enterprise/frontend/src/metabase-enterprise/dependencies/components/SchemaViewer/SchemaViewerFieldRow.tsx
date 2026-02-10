import { Handle, Position } from "@xyflow/react";

import { Box, Group } from "metabase/ui";
import type { ErdField } from "metabase-types/api";

import S from "./SchemaViewerFieldRow.module.css";
import { ROW_HEIGHT } from "./constants";

interface SchemaViewerFieldRowProps {
  field: ErdField;
  isConnected: boolean;
  hasSelfRefTarget?: boolean;
}

export function SchemaViewerFieldRow({
  field,
  isConnected,
  hasSelfRefTarget,
}: SchemaViewerFieldRowProps) {
  const isPK =
    field.semantic_type === "type/PK" || field.semantic_type === "PK";
  const isFK =
    field.semantic_type === "type/FK" || field.semantic_type === "FK";

  return (
    <Group className={S.row} gap="xs" wrap="nowrap" h={ROW_HEIGHT} px="lg">
      <Box
        className={S.name}
        fz="sm"
        fw={isPK ? "bold" : "normal"}
        style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}
      >
        {field.name}
      </Box>
      <Box fz="sm" c="text-tertiary" style={{ flexShrink: 0 }}>
        {field.database_type.toLowerCase()}
      </Box>
      {isFK && isConnected && (
        <Handle
          type="source"
          position={Position.Right}
          id={`field-${field.id}`}
          className={S.handle}
        />
      )}
      {isPK && isConnected && (
        <Handle
          type="target"
          position={Position.Left}
          id={`field-${field.id}`}
          className={S.handle}
        />
      )}
      {isPK && hasSelfRefTarget && (
        <Handle
          type="target"
          position={Position.Right}
          id={`field-${field.id}-right`}
          className={S.handle}
        />
      )}
    </Group>
  );
}
