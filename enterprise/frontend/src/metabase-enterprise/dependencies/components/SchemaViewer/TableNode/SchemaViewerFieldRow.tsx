import { Handle, Position, useNodes, useReactFlow } from "@xyflow/react";

import { Box, Group } from "metabase/ui";
import type { ConcreteTableId, ErdField, TableId } from "metabase-types/api";

import { useSchemaViewerContext } from "../SchemaViewerContext";
import { COMPACT_ZOOM_THRESHOLD, ROW_HEIGHT } from "../constants";
import { getNodeId } from "../utils";

import S from "./SchemaViewerFieldRow.module.css";

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
  const { fitView } = useReactFlow();
  const nodes = useNodes();

  const isPK =
    field.semantic_type === "type/PK" || field.semantic_type === "PK";
  const isFK =
    field.semantic_type === "type/FK" || field.semantic_type === "FK";

  // FK field that has a target table not yet on the canvas
  const canExpand =
    isFK &&
    field.fk_target_table_id != null &&
    !visibleTableIds.has(field.fk_target_table_id);

  // FK field that has a target table already on the canvas
  const canZoomTo =
    isFK &&
    field.fk_target_table_id != null &&
    visibleTableIds.has(field.fk_target_table_id);

  const handleClick = () => {
    if (canExpand && field.fk_target_table_id != null) {
      onExpandToTable(field.fk_target_table_id as ConcreteTableId);
    } else if (canZoomTo && field.fk_target_table_id != null) {
      const node = nodes.find(
        (n) =>
          n.id === getNodeId({ table_id: field.fk_target_table_id as TableId }),
      );
      if (node) {
        fitView({
          nodes: [node],
          duration: 300,
          padding: 0.5,
          minZoom: COMPACT_ZOOM_THRESHOLD,
          interpolate: "linear",
        });
      }
    }
  };

  const isClickable = canExpand || canZoomTo;

  return (
    <Group
      className={S.row}
      gap="xs"
      wrap="nowrap"
      h={ROW_HEIGHT}
      px="lg"
      data-expandable={canExpand || undefined}
      onClick={isClickable ? handleClick : undefined}
      style={{ cursor: isClickable ? "pointer" : undefined }}
    >
      <Box
        className={S.name}
        fz="sm"
        fw={isPK ? "bold" : "normal"}
        c={isClickable ? "brand" : undefined}
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
