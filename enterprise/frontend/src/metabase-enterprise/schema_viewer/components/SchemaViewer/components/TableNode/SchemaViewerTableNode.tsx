import type { NodeProps } from "@xyflow/react";
import cx from "classnames";
import { memo, useCallback } from "react";
import { t } from "ttag";

import { Box, FixedSizeIcon, Group, Stack, Tooltip } from "metabase/ui";

import { useSchemaViewerContext } from "../../SchemaViewerContext";
import type { SchemaViewerFlowNode } from "../../types";

import { SchemaViewerFieldRow } from "./SchemaViewerFieldRow";
import S from "./SchemaViewerTableNode.module.css";

type SchemaViewerTableNodeProps = NodeProps<SchemaViewerFlowNode>;

export const SchemaViewerTableNode = memo(function SchemaViewerTableNode({
  id,
  data,
}: SchemaViewerTableNodeProps) {
  const { selectedNodeId, selectNode, zoomToNode } = useSchemaViewerContext();
  // Any field on this node sitting at either end of the currently selected
  // edge implies the node itself is connected to that edge.
  const isConnectedToSelectedEdge = data.selectedFieldIds.size > 0;
  const isUserSelected = selectedNodeId === id;

  const hasHiddenVisibilityType = data.visibility_type !== null;

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

  return (
    <Stack
      className={cx(S.card, {
        [S.selected]: isConnectedToSelectedEdge || isUserSelected,
      })}
      gap={0}
      onDoubleClick={handleDoubleClick}
    >
      <Group
        className={S.header}
        gap="sm"
        px="md"
        py="md"
        wrap="nowrap"
        onClick={handleHeaderClick}
        style={{ cursor: "pointer" }}
      >
        <FixedSizeIcon name="table" c="text-secondary" />
        <Box
          fz={17}
          lh="1.5rem"
          fw={700}
          c="text-primary"
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            flex: 1,
          }}
        >
          {data.name}
        </Box>
        {hasHiddenVisibilityType && (
          <Tooltip label={t`This table is hidden`}>
            <FixedSizeIcon name="eye_crossed_out" c="text-secondary" />
          </Tooltip>
        )}
      </Group>
      <Box className={S.fields}>
        {data.fields.map((field) => (
          <SchemaViewerFieldRow
            key={field.id}
            field={field}
            isSource={data.sourceFieldIds.has(field.id)}
            isTarget={data.targetFieldIds.has(field.id)}
            isSelfRefTarget={data.selfRefTargetFieldIds.has(field.id)}
            isSelectedInEdge={data.selectedFieldIds.has(field.id)}
          />
        ))}
      </Box>
    </Stack>
  );
});
