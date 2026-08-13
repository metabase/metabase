import { Handle, Position, useReactFlow } from "@xyflow/react";
import cx from "classnames";

import { getColumnIcon } from "metabase/common/utils/columns";
import { Box, FixedSizeIcon, Group, Loader } from "metabase/ui";
import * as Lib from "metabase-lib";
import type { ErdField, IconName } from "metabase-types/api";

import { useSchemaViewerContext } from "../../SchemaViewerContext";
import { ROW_HEIGHT_PX } from "../../constants";
import type { SchemaViewerFlowEdge, SchemaViewerFlowNode } from "../../types";
import { getEdgeId, getFieldHandleId, getNodeId } from "../../utils";

import S from "./SchemaViewerFieldRow.module.css";

function getFieldIcon(field: ErdField): IconName {
  return getColumnIcon(
    Lib.legacyColumnTypeInfo({
      base_type: field.base_type ?? undefined,
      effective_type: field.effective_type ?? undefined,
      semantic_type: field.semantic_type,
    }),
  );
}

type SchemaViewerFieldRowProps = {
  field: ErdField;
  /** Field participates as the source side of at least one edge. */
  isSource: boolean;
  /** Field participates as the target side of at least one non-self-ref edge. */
  isTarget: boolean;
  isSelfRefTarget: boolean;
  isSelectedInEdge?: boolean;
};

export function SchemaViewerFieldRow({
  field,
  isSource,
  isTarget,
  isSelfRefTarget,
  isSelectedInEdge,
}: SchemaViewerFieldRowProps) {
  const { visibleTableIds, expandingTableIds, expandToTable, zoomToNode } =
    useSchemaViewerContext();
  const { setEdges } = useReactFlow<
    SchemaViewerFlowNode,
    SchemaViewerFlowEdge
  >();

  const isFkField = Lib.isForeignKey(Lib.legacyColumnTypeInfo(field));

  const icon: IconName = getFieldIcon(field);

  // FK field that has a target table not yet on the canvas
  const canExpand =
    isFkField &&
    field.fk_target_table_id != null &&
    !visibleTableIds.has(field.fk_target_table_id);

  // FK field that has a target table already on the canvas
  const canZoomTo =
    isFkField &&
    field.fk_target_table_id != null &&
    visibleTableIds.has(field.fk_target_table_id);

  // True while an FK-click fetch is in flight for this field's target table.
  const isExpanding =
    isFkField &&
    field.fk_target_table_id != null &&
    expandingTableIds.has(field.fk_target_table_id);

  const handleClick = (event: React.MouseEvent) => {
    // Keep the click from bubbling up to the node, otherwise React Flow
    // treats it as a node-click and clears all edge selection.
    event.stopPropagation();
    if (canExpand && field.fk_target_table_id != null) {
      // Pre-compute the edge IDs that will connect the FK field to its
      // target field after expansion to auto-highlight connecting edge. We pass both possible
      // orderings because the backend may put either field first in the
      // edge identifier.
      const candidateEdgeIds =
        field.fk_target_field_id != null
          ? [
              getEdgeId(field.id, field.fk_target_field_id),
              getEdgeId(field.fk_target_field_id, field.id),
            ]
          : undefined;
      expandToTable(field.fk_target_table_id, candidateEdgeIds);
    } else if (canZoomTo && field.fk_target_table_id != null) {
      const targetNodeId = getNodeId({
        table_id: field.fk_target_table_id,
      });
      zoomToNode(targetNodeId);

      // Same edge highlighting logic here.
      if (field.fk_target_field_id != null) {
        const candidateEdgeIds = new Set([
          getEdgeId(field.id, field.fk_target_field_id),
          getEdgeId(field.fk_target_field_id, field.id),
        ]);
        setEdges((edges) =>
          edges.map((edge) => {
            const shouldSelect = candidateEdgeIds.has(edge.id);
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
      gap="sm"
      wrap="nowrap"
      h={ROW_HEIGHT_PX}
      px="md"
      data-clickable={isClickable || undefined}
      onClick={isClickable ? handleClick : undefined}
      style={{ cursor: isClickable ? "pointer" : undefined }}
    >
      <FixedSizeIcon
        name={icon}
        size={16}
        c={isSelectedInEdge ? "core-brand" : undefined}
        className={isSelectedInEdge ? undefined : S.icon}
        style={{ flexShrink: 0 }}
      />
      <Box
        className={cx(S.name, { [S.clickableName]: isClickable })}
        fz="sm"
        fw={isSelectedInEdge ? "bold" : "normal"}
        c={isSelectedInEdge ? "core-brand" : undefined}
      >
        {field.name}
      </Box>
      {isExpanding ? (
        <Loader size="xs" data-testid="schema-viewer-field-row-loader" />
      ) : (
        <Box fz="sm" c="text-secondary" style={{ flexShrink: 0 }}>
          {field.database_type.toLowerCase()}
        </Box>
      )}
      {canExpand && !isExpanding && <Box className={S.expandIndicator} />}
      {/* Handles are invisible but required for React Flow to draw edges. */}
      {isSource && (
        <Handle
          type="source"
          position={Position.Right}
          id={getFieldHandleId(field.id)}
          className={S.handle}
        />
      )}
      {isTarget && (
        <Handle
          type="target"
          position={Position.Left}
          id={getFieldHandleId(field.id)}
          className={S.handle}
        />
      )}
      {isSelfRefTarget && (
        <Handle
          type="target"
          position={Position.Right}
          id={getFieldHandleId(field.id, "right")}
          className={S.handle}
        />
      )}
    </Group>
  );
}
