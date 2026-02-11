import { Handle, Position } from "@xyflow/react";

import { Box, Group } from "metabase/ui";
import type { ConcreteTableId, ErdField } from "metabase-types/api";

import { useSchemaViewerContext } from "../SchemaViewerContext";

import S from "./SchemaViewerFieldRow.module.css";
import { ROW_HEIGHT } from "../constants";

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
  const { visibleTableIds, onExpandToTable } = useSchemaViewerContext();

  const isPK =
    field.semantic_type === "type/PK" || field.semantic_type === "PK";
  const isFK =
    field.semantic_type === "type/FK" || field.semantic_type === "FK";

  // FK field that has a target table not yet on the canvas
  const canExpand =
    isFK &&
    field.fk_target_table_id != null &&
    !visibleTableIds.has(field.fk_target_table_id);

  const handleClick = () => {
    if (canExpand && field.fk_target_table_id != null) {
      onExpandToTable(field.fk_target_table_id as ConcreteTableId);
    }
  };

  return (
    <Group
      className={S.row}
      gap="xs"
      wrap="nowrap"
      h={ROW_HEIGHT}
      px="lg"
      data-expandable={canExpand || undefined}
      onClick={canExpand ? handleClick : undefined}
      style={{ cursor: canExpand ? "pointer" : undefined }}
    >
      <Box
        className={S.name}
        fz="sm"
        fw={isPK ? "bold" : "normal"}
        c={canExpand ? "brand" : undefined}
        style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}
      >
        {field.name}
      </Box>
      <Box fz="sm" c="text-tertiary" style={{ flexShrink: 0 }}>
        {field.database_type.toLowerCase()}
      </Box>
      {/* These handles are invisible in our design, but they're required for proper edge drawing */}
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
