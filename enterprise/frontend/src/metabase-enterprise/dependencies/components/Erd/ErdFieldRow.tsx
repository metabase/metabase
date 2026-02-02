import { Handle, Position } from "@xyflow/react";

import { Box, Group } from "metabase/ui";
import type { ErdField } from "metabase-types/api";

import S from "./ErdFieldRow.module.css";
import { ROW_HEIGHT } from "./constants";
import { getFieldTypeBadge } from "./utils";

interface ErdFieldRowProps {
  field: ErdField;
  isConnected: boolean;
  hasSelfRefTarget?: boolean;
}

export function ErdFieldRow({
  field,
  isConnected,
  hasSelfRefTarget,
}: ErdFieldRowProps) {
  const isPK =
    field.semantic_type === "type/PK" || field.semantic_type === "PK";
  const isFK =
    field.semantic_type === "type/FK" || field.semantic_type === "FK";
  const badge = getFieldTypeBadge(field.database_type, field.semantic_type);

  return (
    <Group className={S.row} gap="xs" wrap="nowrap" h={ROW_HEIGHT} px="lg">
      <Box className={S.badge} fz="xs" fw="bold" style={{ color: badge.color }}>
        {badge.label}
      </Box>
      <Box
        className={S.name}
        fz="sm"
        fw={isPK ? "bold" : "normal"}
        style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}
      >
        {field.name}
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
