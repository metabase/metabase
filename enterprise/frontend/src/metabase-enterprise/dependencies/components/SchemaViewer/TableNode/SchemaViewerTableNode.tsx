import { type NodeProps, useReactFlow, useStore } from "@xyflow/react";
import cx from "classnames";
import { memo, useCallback, useMemo } from "react";

import { Box, FixedSizeIcon, Group, Stack } from "metabase/ui";
import { isTypePK } from "metabase-lib/v1/types/utils/isa";

import { useSchemaViewerContext } from "../SchemaViewerContext";
import type { SchemaViewerFlowNode } from "../types";
import { useZoomToNodes } from "../useZoomToNodes";

import { SchemaViewerFieldRow } from "./SchemaViewerFieldRow";
import S from "./SchemaViewerTableNode.module.css";

type SchemaViewerTableNodeProps = NodeProps<SchemaViewerFlowNode>;

// Track which node is currently focused for double-click toggle
let focusedNodeId: string | null = null;

export const SchemaViewerTableNode = memo(function SchemaViewerTableNode({
  id,
  data,
}: SchemaViewerTableNodeProps) {
  const { fitView } = useReactFlow<SchemaViewerFlowNode>();
  const zoomToNodes = useZoomToNodes();
  const { selectedNodeId, onSelectNode } = useSchemaViewerContext();
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
    (a, b) => a.size === b.size && [...a].every((x) => b.has(x)),
  );
  const isUserSelected = selectedNodeId === id;

  const handleDoubleClick = useCallback(() => {
    if (focusedNodeId === id) {
      // Already focused → zoom back out to show the whole graph
      fitView({ duration: 300 });
      focusedNodeId = null;
    } else {
      // Focus on this node using the shared zoom rules (≥0.5 zoom, header
      // kept in the viewport).
      zoomToNodes([id], { duration: 300 });
      focusedNodeId = id;
    }
  }, [fitView, id, zoomToNodes]);

  const handleHeaderClick = useCallback(
    (event: React.MouseEvent) => {
      // Prevent React Flow's default left-click node handling from clearing
      // the edge selection we manage in SchemaViewer.
      event.stopPropagation();
      onSelectNode(id);
    },
    [id, onSelectNode],
  );

  // Find PK field IDs that are targets of self-referencing FKs
  const selfRefTargetIds = useMemo(() => {
    const pkIds = new Set(
      data.fields.filter((f) => isTypePK(f.semantic_type)).map((f) => f.id),
    );
    const targetIds = new Set<number>();
    for (const field of data.fields) {
      if (
        field.fk_target_field_id != null &&
        pkIds.has(field.fk_target_field_id)
      ) {
        targetIds.add(field.fk_target_field_id);
      }
    }
    return targetIds;
  }, [data.fields]);

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
        gap={8}
        px={16}
        py={16}
        wrap="nowrap"
        onClick={handleHeaderClick}
        style={{ cursor: "pointer" }}
      >
        <FixedSizeIcon name="table2" c="text-secondary" />
        <Box
          fz={17}
          lh="24px"
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
            isConnected={data.connectedFieldIds.has(field.id)}
            isSelectedInEdge={selectedFieldIds.has(field.id)}
            hasSelfRefTarget={selfRefTargetIds.has(field.id)}
          />
        ))}
      </Box>
    </Stack>
  );
});
