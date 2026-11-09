// Deliberate import-time side effect: xyflow's stylesheet must load with this
// chunk, like the schema viewer's.
import "@xyflow/react/dist/style.css";
import {
  Background,
  BaseEdge,
  Controls,
  type Edge,
  type EdgeProps,
  Handle,
  MarkerType,
  type Node,
  type NodeProps,
  Panel,
  Position,
  ReactFlow,
  getSmoothStepPath,
  useNodesInitialized,
  useNodesState,
} from "@xyflow/react";
import cx from "classnames";
import { memo, useEffect, useMemo, useState } from "react";
import { t } from "ttag";

import { usePalette } from "metabase/common/hooks/use-palette";
import {
  type OrderedValue,
  type TransitionKind,
  type ValueBucket,
  getValueBucketLabel,
  isTerminalBucket,
} from "metabase/metadata/lifecycle";
import {
  ActionIcon,
  Badge,
  type BadgeProps,
  Box,
  Card,
  FixedSizeIcon,
  Group,
  Icon,
  Stack,
  Text,
  useColorScheme,
} from "metabase/ui";
import type { IconName } from "metabase-types/api";

import { TransitionKindValue } from "../TransitionKindValue";
import type { TransitionRow } from "../use-process-model";

import S from "./TransitionsDiagram.module.css";
import {
  type EdgeRoute,
  NODE_HEIGHT,
  NODE_WIDTH,
  layoutStates,
} from "./layout";

// Good, bad, and neither: a final state's badge says which
export const BUCKET_BADGE_COLORS: Record<ValueBucket, BadgeProps["color"]> = {
  open: "neutral",
  won: "positive",
  lost: "negative",
  cancelled: "neutral",
  other: "neutral",
};

const BUCKET_ICONS: Record<ValueBucket, IconName> = {
  open: "progress",
  won: "check",
  lost: "close",
  cancelled: "ban",
  other: "unknown",
};

type StateNodeData = { state: OrderedValue; isConnected: boolean };
type StateFlowNode = Node<StateNodeData, "state">;

type TransitionEdgeData = { route: EdgeRoute; span: number };
type TransitionFlowEdge = Edge<TransitionEdgeData, "transition">;

const NODE_TYPES = { state: StateNode };
const EDGE_TYPES = { transition: memo(TransitionEdge) };
const PRO_OPTIONS = { hideAttribution: true };
const FIT_VIEW_OPTIONS = { padding: 0.1, maxZoom: 1 };

const ROUTE_HANDLES: Record<
  EdgeRoute,
  { sourceHandle: string; targetHandle: string }
> = {
  next: { sourceHandle: "next-out", targetHandle: "next-in" },
  skip: { sourceHandle: "skip-out", targetHandle: "skip-in" },
  back: { sourceHandle: "back-out", targetHandle: "back-in" },
};

type TransitionsDiagramProps = {
  states: OrderedValue[];
  rows: TransitionRow[];
  readOnly: boolean;
  /** Fills its frame; the drawer and the expanded view pass different heights */
  height: number | string;
  onKindChange: (key: string, kind: TransitionKind) => void;
};

/**
 * PROTOTYPE: mocked. A table's states as nodes and the moves between them as
 * arrows, drawn like the schema viewer. Clicking an arrow selects it and
 * opens its kind, to confirm sync's guess or pick another.
 */
export function TransitionsDiagram({
  states,
  rows,
  readOnly,
  height,
  onKindChange,
}: TransitionsDiagramProps) {
  const { colorScheme } = useColorScheme();
  const palette = usePalette();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const selectedRow = rows.find(({ key }) => key === selectedKey);
  const layout = useMemo(() => layoutStates(states, rows), [states, rows]);

  const layoutNodes = useMemo(
    (): StateFlowNode[] =>
      states.map((state) => ({
        id: state.value,
        type: "state",
        position: layout.positions.get(state.value) ?? { x: 0, y: 0 },
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
        data: {
          state,
          isConnected:
            selectedRow != null &&
            (selectedRow.from === state.value ||
              selectedRow.to === state.value),
        },
      })),
    [states, layout, selectedRow],
  );
  const [nodes, setNodes, onNodesChange] = useNodesState(layoutNodes);
  useEffect(() => setNodes(layoutNodes), [layoutNodes, setNodes]);

  const edges = useMemo((): TransitionFlowEdge[] => {
    const strokes: Record<TransitionKind | "selected", string> = {
      typical:
        palette["border-neutral-strong"] ??
        "var(--mb-color-border-neutral-strong)",
      allowed:
        palette["border-neutral-strong"] ??
        "var(--mb-color-border-neutral-strong)",
      unexpected:
        palette["feedback-negative"] ?? "var(--mb-color-feedback-negative)",
      selected: palette["core-brand"] ?? "var(--mb-color-core-brand)",
    };
    return rows.map((row) => {
      const route = layout.getRoute(row.from, row.to);
      const isSelected = row.key === selectedKey;
      const stroke = strokes[isSelected ? "selected" : row.resolvedKind];
      return {
        id: row.key,
        type: "transition",
        source: row.from,
        target: row.to,
        ...ROUTE_HANDLES[route],
        // The selected arrow draws over the rest
        zIndex: isSelected ? 1 : 0,
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: stroke,
          width: 16,
          height: 16,
        },
        style: {
          stroke,
          strokeWidth: isSelected ? 2 : 1,
          // Typical moves are solid; anything off the happy path is dashed
          strokeDasharray: row.resolvedKind === "typical" ? undefined : "9 9",
        },
        data: { route, span: layout.getSpan(row.from, row.to) },
      };
    });
  }, [rows, layout, selectedKey, palette]);

  return (
    <Box className={S.frame} h={height} data-testid="transitions-diagram">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        proOptions={PRO_OPTIONS}
        colorMode={colorScheme === "dark" ? "dark" : "light"}
        fitView
        fitViewOptions={FIT_VIEW_OPTIONS}
        minZoom={0.2}
        maxZoom={1}
        nodesDraggable={false}
        nodesConnectable={false}
        // The drawer scrolls; the diagram zooms with its buttons instead
        zoomOnScroll={false}
        preventScrolling={false}
        onNodesChange={onNodesChange}
        onEdgeClick={(_event, edge) => setSelectedKey(edge.id)}
        onPaneClick={() => setSelectedKey(null)}
      >
        <Background />
        <Controls showInteractive={false} />
        {selectedRow && (
          <Panel position="top-right">
            <TransitionPanel
              row={selectedRow}
              readOnly={readOnly}
              onKindChange={(kind) => onKindChange(selectedRow.key, kind)}
              onClose={() => setSelectedKey(null)}
            />
          </Panel>
        )}
      </ReactFlow>
    </Box>
  );
}

function StateNode({ data }: NodeProps<StateFlowNode>) {
  const { value, bucket } = data.state;
  return (
    <div className={cx(S.node, { [S.connected]: data.isConnected })}>
      <Handle
        id="next-in"
        type="target"
        position={Position.Left}
        className={S.handle}
      />
      <Handle
        id="next-out"
        type="source"
        position={Position.Right}
        className={S.handle}
      />
      <Handle
        id="skip-out"
        type="source"
        position={Position.Top}
        className={S.handle}
        style={{ left: "70%" }}
      />
      <Handle
        id="skip-in"
        type="target"
        position={Position.Top}
        className={S.handle}
        style={{ left: "30%" }}
      />
      <Handle
        id="back-out"
        type="source"
        position={Position.Bottom}
        className={S.handle}
        style={{ left: "30%" }}
      />
      <Handle
        id="back-in"
        type="target"
        position={Position.Bottom}
        className={S.handle}
        style={{ left: "70%" }}
      />
      <FixedSizeIcon name={BUCKET_ICONS[bucket]} c="text-secondary" />
      <span className={S.name} title={value}>
        {value}
      </span>
      {isTerminalBucket(bucket) && (
        <Badge
          variant="light"
          color={BUCKET_BADGE_COLORS[bucket]}
          flex="0 0 auto"
        >
          {getValueBucketLabel(bucket)}
        </Badge>
      )}
    </div>
  );
}

/**
 * The schema viewer's right-angled path. Loops over the top or under the
 * bottom sit further out the more columns they cross, so they don't stack.
 */
function TransitionEdge({
  id,
  data,
  style,
  markerEnd,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
}: EdgeProps<TransitionFlowEdge>) {
  const isInitialized = useNodesInitialized();
  const route = data?.route ?? "next";
  const span = data?.span ?? 1;
  const [path] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 8,
    offset: route === "next" ? 20 : 24 + span * 16,
  });

  return (
    <BaseEdge
      id={id}
      path={path}
      markerEnd={markerEnd}
      className={S.edge}
      // A wide invisible path, so a thin arrow is easy to click
      interactionWidth={20}
      style={{
        ...style,
        visibility: isInitialized ? undefined : "hidden",
      }}
    />
  );
}

function TransitionPanel({
  row,
  readOnly,
  onKindChange,
  onClose,
}: {
  row: TransitionRow;
  readOnly: boolean;
  onKindChange: (kind: TransitionKind) => void;
  onClose: () => void;
}) {
  return (
    <Card className={S.panel} withBorder shadow="md" p="md">
      <Stack gap="sm">
        <Group justify="space-between" wrap="nowrap" align="flex-start">
          <Text fw="bold">{`${row.from} → ${row.to}`}</Text>
          <ActionIcon
            size="sm"
            variant="subtle"
            aria-label={t`Close`}
            onClick={onClose}
          >
            <Icon name="close" />
          </ActionIcon>
        </Group>
        <Text size="sm" c="text-secondary">
          {row.count > 0
            ? t`${row.count} seen in the history`
            : t`Not seen in the history`}
        </Text>
        <TransitionKindValue
          row={row}
          disabled={readOnly}
          onChange={onKindChange}
        />
      </Stack>
    </Card>
  );
}
