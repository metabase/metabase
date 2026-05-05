import { type NodeProps, useStore } from "@xyflow/react";
import cx from "classnames";
import { memo, useCallback } from "react";

import { Box, FixedSizeIcon, Group, Stack } from "metabase/ui";

import { useSchemaViewerContext } from "../../SchemaViewerContext";
import type { SchemaViewerFlowNode } from "../../types";

import { SchemaViewerFieldRow } from "./SchemaViewerFieldRow";
import S from "./SchemaViewerTableNode.module.css";

type SchemaViewerTableNodeProps = NodeProps<SchemaViewerFlowNode>;

export const SchemaViewerTableNode = memo(function SchemaViewerTableNode({
  id,
  data,
}: SchemaViewerTableNodeProps) {
  const { selectedNodeId, onSelectNode, zoomToNode } = useSchemaViewerContext();
  // Highlight this node when any edge that touches it is selected. Uses a
  // React Flow store selector (rather than useEdges()) so the node only
  // re-renders when its own connection-selected state actually flips, not
  // on every edge change.
  const isConnectedToSelectedEdge = useStore((state) => {
    for (const e of state.edges) {
      if (e.selected && (e.source === id || e.target === id)) {
        return true;
      }
    }
    return false;
  });
  // Field IDs belonging to this node that sit at either end of a currently
  // selected edge — used to paint those rows in the brand color.
  const selectedFieldIds = useStore(
    (state) => {
      const ids = new Set<number>();
      for (const e of state.edges) {
        if (!e.selected) {
          continue;
        }
        if (e.source === id && e.sourceHandle) {
          const m = /^field-(\d+)/.exec(e.sourceHandle);
          if (m) {
            ids.add(Number(m[1]));
          }
        }
        if (e.target === id && e.targetHandle) {
          const m = /^field-(\d+)/.exec(e.targetHandle);
          if (m) {
            ids.add(Number(m[1]));
          }
        }
      }
      return ids;
    },
    (a, b) => a.size === b.size && a.intersection(b).size === a.size,
  );
  const isUserSelected = selectedNodeId === id;

  const handleDoubleClick = useCallback(() => {
    zoomToNode(id);
  }, [id, zoomToNode]);

  const handleHeaderClick = useCallback(
    (event: React.MouseEvent) => {
      // Prevent React Flow's default left-click node handling from clearing
      // the edge selection we manage in SchemaViewer.
      event.stopPropagation();
      onSelectNode(id);
    },
    [id, onSelectNode],
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
        <FixedSizeIcon name="table2" c="text-secondary" />
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
      </Group>
      <Box className={S.fields}>
        {data.fields.map((field) => (
          <SchemaViewerFieldRow
            key={field.id}
            field={field}
            isSource={data.sourceFieldIds.has(field.id)}
            isTarget={data.targetFieldIds.has(field.id)}
            isSelfRefTarget={data.selfRefTargetFieldIds.has(field.id)}
            isSelectedInEdge={selectedFieldIds.has(field.id)}
          />
        ))}
      </Box>
    </Stack>
  );
});
