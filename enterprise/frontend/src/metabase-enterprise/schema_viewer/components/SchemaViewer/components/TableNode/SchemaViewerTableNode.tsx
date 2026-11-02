import type { NodeProps } from "@xyflow/react";
import cx from "classnames";
import { memo, useCallback } from "react";
import { msgid, ngettext, t } from "ttag";

import { Box, FixedSizeIcon, Stack, Tooltip } from "metabase/ui";

import {
  useIsSchemaViewerNodeDetailed,
  useSchemaViewerContext,
} from "../../SchemaViewerContext";
import { ROW_HEIGHT_PX } from "../../constants";
import type { SchemaViewerFlowNode, SchemaViewerNodeData } from "../../types";

import { SchemaViewerFieldRow } from "./SchemaViewerFieldRow";
import S from "./SchemaViewerTableNode.module.css";

type SchemaViewerTableNodeProps = NodeProps<SchemaViewerFlowNode>;

export const SchemaViewerTableNode = memo(function SchemaViewerTableNode({
  id,
  data,
}: SchemaViewerTableNodeProps) {
  const { selectedNodeId, selectNode, zoomToNode } = useSchemaViewerContext();
  const isDetailed = useIsSchemaViewerNodeDetailed(id);
  // Any field on this node sitting at either end of the currently selected
  // edge implies the node itself is connected to that edge.
  const isConnectedToSelectedEdge = data.selectedFieldIds.size > 0;
  const isUserSelected = selectedNodeId === id;

  const hasHiddenVisibilityType = data.visibility_type !== null;
  const fieldCount = data.fields.length;
  const { foreignKeyCount } = data;

  const handleDoubleClick = useCallback(() => {
    zoomToNode(id);
  }, [id, zoomToNode]);

  const handleHeaderClick = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation();
      selectNode(id);
    },
    [id, selectNode],
  );

  const cardClassName = cx(S.card, {
    [S.selected]: isConnectedToSelectedEdge || isUserSelected,
  });

  if (!isDetailed) {
    return (
      <div
        className={cardClassName}
        data-detail-level="summary"
        onDoubleClick={handleDoubleClick}
      >
        <TableNodeHeader
          name={data.name}
          isHidden={hasHiddenVisibilityType}
          fieldCount={fieldCount}
          foreignKeyCount={foreignKeyCount}
          onClick={handleHeaderClick}
        />
        {/* Skeleton rows are a CSS background, so they add no DOM per field. */}
        <div className={S.skeletonRows}>
          {data.linkedForeignKeyRows.count > 0 && (
            <div
              className={S.linkedSkeletonRows}
              style={getLinkedSkeletonRowsStyle(data.linkedForeignKeyRows)}
            />
          )}
        </div>
      </div>
    );
  }

  return (
    <Stack
      className={cardClassName}
      data-detail-level="full"
      gap={0}
      onDoubleClick={handleDoubleClick}
    >
      <TableNodeHeader
        name={data.name}
        isHidden={hasHiddenVisibilityType}
        fieldCount={fieldCount}
        foreignKeyCount={foreignKeyCount}
        onClick={handleHeaderClick}
      />
      <Box className={S.fields}>
        {data.fields.map((field) => (
          <SchemaViewerFieldRow
            key={field.id}
            field={field}
            isSelectedInEdge={data.selectedFieldIds.has(field.id)}
          />
        ))}
      </Box>
    </Stack>
  );
});

/**
 * Covers the linked FK rows with brand-colored skeletons. Background offsets
 * start at the overlay's first row so each row keeps the name-bar length it
 * has in the base skeleton (lengths alternate between even and odd rows).
 */
function getLinkedSkeletonRowsStyle({
  start,
  count,
}: SchemaViewerNodeData["linkedForeignKeyRows"]): React.CSSProperties {
  const offset = start * ROW_HEIGHT_PX;
  return {
    top: offset,
    height: count * ROW_HEIGHT_PX,
    backgroundPosition: `1rem ${-offset}px, 2.5rem ${-offset}px, 2.5rem ${ROW_HEIGHT_PX - offset}px`,
  };
}

type TableNodeHeaderProps = {
  name: string;
  isHidden: boolean;
  fieldCount: number;
  foreignKeyCount: number;
  onClick: (event: React.MouseEvent) => void;
};

/** Shared by both detail levels so switching between them never shifts the header. */
function TableNodeHeader({
  name,
  isHidden,
  fieldCount,
  foreignKeyCount,
  onClick,
}: TableNodeHeaderProps) {
  return (
    <div className={S.header} onClick={onClick}>
      <FixedSizeIcon name="table" c="text-secondary" />
      <span className={S.title}>{name}</span>
      {isHidden && (
        <Tooltip label={t`This table is hidden`}>
          <FixedSizeIcon name="eye_crossed_out" c="text-secondary" />
        </Tooltip>
      )}
      <span
        className={S.count}
        role="group"
        aria-label={ngettext(
          msgid`${fieldCount} field`,
          `${fieldCount} fields`,
          fieldCount,
        )}
      >
        <FixedSizeIcon name="field" size={14} />
        {fieldCount}
      </span>
      <span
        className={S.count}
        role="group"
        aria-label={ngettext(
          msgid`${foreignKeyCount} foreign key`,
          `${foreignKeyCount} foreign keys`,
          foreignKeyCount,
        )}
      >
        <FixedSizeIcon name="connections" size={14} />
        {foreignKeyCount}
      </span>
    </div>
  );
}
