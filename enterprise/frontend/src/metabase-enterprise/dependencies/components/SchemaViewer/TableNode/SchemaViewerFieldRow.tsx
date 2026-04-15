import { Handle, Position, useReactFlow } from "@xyflow/react";

import { Box, Group } from "metabase/ui";
import type { ConcreteTableId, ErdField } from "metabase-types/api";

import { useSchemaViewerContext } from "../SchemaViewerContext";
import { ROW_HEIGHT } from "../constants";
import type { SchemaViewerFlowEdge, SchemaViewerFlowNode } from "../types";
import { useZoomToNodes } from "../useZoomToNodes";
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
  const zoomToNodes = useZoomToNodes();
  const { setEdges } = useReactFlow<
    SchemaViewerFlowNode,
    SchemaViewerFlowEdge
  >();

  const isPK =
    field.semantic_type === "type/PK" || field.semantic_type === "PK";
  const isFK =
    field.semantic_type === "type/FK" || field.semantic_type === "FK";

  // FK field that has a target table not yet on the canvas
  const canExpand =
    isFK &&
    field.fk_target_table_id != null &&
    !visibleTableIds.has(field.fk_target_table_id as ConcreteTableId);

  // FK field that has a target table already on the canvas
  const canZoomTo =
    isFK &&
    field.fk_target_table_id != null &&
    visibleTableIds.has(field.fk_target_table_id as ConcreteTableId);

  const handleClick = (event: React.MouseEvent) => {
    // Keep the click from bubbling up to the node, otherwise React Flow
    // treats it as a node-click and clears all edge selection — which would
    // wipe out the edge we're about to highlight just below.
    event.stopPropagation();
    if (canExpand && field.fk_target_table_id != null) {
      // Pre-compute the edge IDs that will connect the FK field to its
      // target field after expansion, so SchemaViewer can auto-highlight
      // that edge once the new graph data arrives. We pass both possible
      // orderings because the backend may put either field first in the
      // edge identifier.
      const candidateEdgeIds =
        field.fk_target_field_id != null
          ? [
              `edge-${field.id}-${field.fk_target_field_id}`,
              `edge-${field.fk_target_field_id}-${field.id}`,
            ]
          : undefined;
      onExpandToTable(
        field.fk_target_table_id as ConcreteTableId,
        candidateEdgeIds,
      );
    } else if (canZoomTo && field.fk_target_table_id != null) {
      const targetNodeId = getNodeId({
        table_id: field.fk_target_table_id,
      });
      zoomToNodes([targetNodeId], { duration: 300 });

      // Also highlight the connecting edge — the same visual treatment
      // the user would get from clicking the edge directly. We try both
      // possible edge ID orderings (the backend's source/target convention
      // for edge IDs isn't fixed) and select whichever exists.
      if (field.fk_target_field_id != null) {
        const candidateEdgeIds = new Set([
          `edge-${field.id}-${field.fk_target_field_id}`,
          `edge-${field.fk_target_field_id}-${field.id}`,
        ]);
        setEdges((edges) =>
          edges.map((edge) => {
            const shouldSelect = candidateEdgeIds.has(edge.id);
            // Only allocate a new object if the selection state actually
            // changes for this edge — avoids unnecessary re-renders.
            if (shouldSelect && !edge.selected) {
              return { ...edge, selected: true };
            }
            if (!shouldSelect && edge.selected) {
              return { ...edge, selected: false };
            }
            return edge;
          }),
        );
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
      {canExpand && <Box className={S.expandIndicator} />}
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
