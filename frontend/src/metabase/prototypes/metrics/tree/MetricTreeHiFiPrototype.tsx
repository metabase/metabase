import "@xyflow/react/dist/style.css";
import {
  Background,
  type Edge,
  type EdgeProps,
  Handle,
  MiniMap,
  type Node,
  type NodeProps,
  Panel,
  Position,
  ReactFlow,
  getSmoothStepPath,
  useNodesState,
} from "@xyflow/react";
import cx from "classnames";
import { createContext, useContext, useMemo, useState } from "react";

import {
  ActionIcon,
  Box,
  Button,
  Card,
  Center,
  FixedSizeIcon,
  Group,
  Stack,
  Text,
  Title,
  UnstyledButton,
  useColorScheme,
} from "metabase/ui";

import { LineChart } from "../Sparkline";
import { getMeasure } from "../data";

import { MetricDependenciesPage } from "./MetricDependenciesPage";
import S from "./MetricTreeHiFi.module.css";
import {
  METRICS,
  type Operator,
  describe,
  formatValue,
  opOf,
  seriesOf,
} from "./MetricTreePrototype";

const NODE_W = 320;
const NODE_H = 160;
const COL_GAP = 160;
const ROW_GAP = 40;
const OP_RADIUS = 14;
const OP_OFFSET = 36;

type TermData = { id: string; path: string };
type TermNode = Node<TermData, "term">;
type TermEdgeData = {
  childPath: string;
  op: Operator | null;
  highlighted: boolean;
};
type TermEdge = Edge<TermEdgeData, "term">;

type TreeContextValue = {
  selectedPath: string;
  select: (path: string) => void;
};

const TreeContext = createContext<TreeContextValue>({
  selectedPath: "root",
  select: () => {},
});

const isOnPath = (path: string, selectedPath: string) =>
  selectedPath === path || selectedPath.startsWith(`${path}/`);

/**
 * Left to right: what the metric is made of on the left, flowing into the
 * metric on the right. Each term enters the metric at its own point, with its
 * operator just before the card, so mixed math like A + B − C reads top down.
 */
function buildGraph(rootId: string): { nodes: TermNode[]; edges: TermEdge[] } {
  const nodes: TermNode[] = [];
  const edges: TermEdge[] = [];
  let slot = 0;

  const visit = (id: string, path: string, depth: number): number => {
    const x = -depth * (NODE_W + COL_GAP);
    const metric = METRICS[id];
    let y: number;
    if (!metric) {
      y = slot++ * (NODE_H + ROW_GAP);
    } else {
      const childYs = metric.inputs.map((input, i) =>
        visit(input, `${path}/${i}`, depth + 1),
      );
      y = (childYs[0] + childYs[childYs.length - 1]) / 2;
      metric.inputs.forEach((_, i) =>
        edges.push({
          id: `${path}/${i}->${path}`,
          source: `${path}/${i}`,
          target: path,
          targetHandle: `in-${i}`,
          type: "term",
          data: {
            childPath: `${path}/${i}`,
            op: i === 0 ? null : opOf(metric, i),
            highlighted: false,
          },
        }),
      );
    }
    nodes.push({
      id: path,
      type: "term",
      position: { x, y },
      data: { id, path },
    });
    return y;
  };

  visit(rootId, "root", 0);
  return { nodes, edges };
}

const NODE_TYPES = { term: TermCard };
const EDGE_TYPES = { term: TermEdgeLine };

/**
 * High-fidelity metric tree in the schema viewer's visual language: dotted
 * canvas, white cards with a header and rows, dashed step edges, minimap and
 * a detail panel on the right.
 */
export function MetricTreeHiFiPrototype() {
  return (
    <MetricDependenciesPage>
      {(example, select) => (
        // Remount per metric so its tree is laid out and fit to view.
        <HiFiTree key={example.id} rootId={example.id} onReroot={select} />
      )}
    </MetricDependenciesPage>
  );
}

function HiFiTree({
  rootId,
  onReroot,
}: {
  rootId: string;
  onReroot: (id: string) => void;
}) {
  const [selectedPath, setSelectedPath] = useState("root");

  return (
    <TreeContext.Provider value={{ selectedPath, select: setSelectedPath }}>
      <Box className={S.canvas}>
        <TreeCanvas rootId={rootId} selectedPath={selectedPath}>
          <InfoPanel
            rootId={rootId}
            selectedPath={selectedPath}
            onReroot={onReroot}
            onClose={() => setSelectedPath("")}
          />
        </TreeCanvas>
      </Box>
    </TreeContext.Provider>
  );
}

function TreeCanvas({
  rootId,
  selectedPath,
  children,
}: {
  rootId: string;
  selectedPath: string;
  children: React.ReactNode;
}) {
  const { colorScheme } = useColorScheme();
  const graph = useMemo(() => buildGraph(rootId), [rootId]);
  const [nodes, , onNodesChange] = useNodesState<TermNode>(graph.nodes);

  const edges = useMemo(
    () =>
      graph.edges.map((edge): TermEdge => {
        const childPath = edge.data?.childPath ?? "";
        const highlighted =
          selectedPath !== "" && isOnPath(childPath, selectedPath);
        return {
          ...edge,
          data: { childPath, op: edge.data?.op ?? null, highlighted },
        };
      }),
    [graph.edges, selectedPath],
  );

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={NODE_TYPES}
      edgeTypes={EDGE_TYPES}
      onNodesChange={onNodesChange}
      proOptions={{ hideAttribution: true }}
      colorMode={colorScheme === "dark" ? "dark" : "light"}
      fitView
      fitViewOptions={{ padding: 0.15, maxZoom: 0.9 }}
      minZoom={0.2}
      maxZoom={1.25}
      nodesConnectable={false}
    >
      <Background />
      <MiniMap
        position="bottom-right"
        pannable
        nodeColor="var(--mb-color-border-neutral-strong)"
        bgColor="var(--mb-color-background_surface-primary)"
        maskStrokeColor="var(--mb-color-border-neutral)"
      />
      {children}
    </ReactFlow>
  );
}

function TermCard({ data }: NodeProps<TermNode>) {
  const { selectedPath, select } = useContext(TreeContext);
  const info = describe(data.id);
  const series = seriesOf(data.id);
  const current = series.at(-1) ?? 0;
  const previous = series.at(-2) ?? current;
  const change = previous === 0 ? 0 : (current - previous) / Math.abs(previous);
  const isMetric = info.kind === "metric";
  const measure = isMetric ? null : getMeasure(data.id.slice(8).split("|")[0]);
  const inputCount = METRICS[data.id]?.inputs.length ?? 0;

  return (
    <Stack
      className={cx(S.card, { [S.selected]: selectedPath === data.path })}
      gap={0}
      onClick={() => select(data.path)}
    >
      {Array.from({ length: inputCount }, (_, i) => (
        <Handle
          key={i}
          id={`in-${i}`}
          type="target"
          position={Position.Left}
          className={S.handle}
          isConnectable={false}
          style={{ top: `${((i + 1) * 100) / (inputCount + 1)}%` }}
        />
      ))}
      <Group className={S.header} gap="sm" px="lg" py="md" wrap="nowrap">
        <Box
          fz={17}
          lh="1.5rem"
          fw={700}
          c="text-primary"
          className={S.truncate}
        >
          {info.name}
        </Box>
        <Group gap={4} wrap="nowrap" c="text-secondary">
          <FixedSizeIcon name={isMetric ? "metric" : "ruler"} size={12} />
          <Text fz="xs" fw={700} c="inherit">
            {isMetric ? "Metric" : "Measure"}
          </Text>
        </Group>
      </Group>
      <Group className={S.row} px="lg" justify="space-between" wrap="nowrap">
        <Text fz={20} fw={700} c="text-primary">
          {formatValue(data.id, current)}
        </Text>
        <Group
          gap={2}
          wrap="nowrap"
          c={change >= 0 ? "feedback-positive" : "feedback-negative"}
        >
          <FixedSizeIcon
            name={change >= 0 ? "arrow_up" : "arrow_down"}
            size={12}
          />
          <Text fz="sm" fw={700} c="inherit">
            {(Math.abs(change) * 100).toFixed(1)}%
          </Text>
          <Text fz="sm" c="text-secondary" ml={4}>
            vs. last month
          </Text>
        </Group>
      </Group>
      <Group className={S.row} px="lg" gap="sm" wrap="nowrap">
        <FixedSizeIcon
          name={isMetric ? "function" : "table"}
          c="text-secondary"
          size={14}
        />
        <Text fz="sm" c="text-secondary" className={S.truncate}>
          {isMetric
            ? info.detail
            : `${measure?.table} · ${measure?.aggregation}`}
        </Text>
      </Group>
      <Handle
        type="source"
        position={Position.Right}
        className={S.handle}
        isConnectable={false}
      />
    </Stack>
  );
}

function TermEdgeLine(props: EdgeProps<TermEdge>) {
  const highlighted = props.data?.highlighted ?? false;
  const op = props.data?.op ?? null;
  const stroke = highlighted
    ? "var(--mb-color-core-brand)"
    : "var(--mb-color-border-neutral-strong)";
  const [path] = getSmoothStepPath({
    sourceX: props.sourceX,
    sourceY: props.sourceY,
    sourcePosition: props.sourcePosition,
    targetX: props.targetX,
    targetY: props.targetY,
    targetPosition: props.targetPosition,
  });

  return (
    <g>
      <path
        d={path}
        fill="none"
        stroke={stroke}
        strokeWidth={highlighted ? 2 : 1}
        strokeDasharray="9 9"
      />
      {op != null && (
        <g
          transform={`translate(${props.targetX - OP_OFFSET}, ${props.targetY})`}
        >
          <circle
            r={OP_RADIUS}
            fill="var(--mb-color-core-white)"
            stroke={stroke}
          />
          <text
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={14}
            fontWeight={700}
            fill={
              highlighted
                ? "var(--mb-color-core-brand)"
                : "var(--mb-color-text-primary)"
            }
          >
            {op}
          </text>
        </g>
      )}
    </g>
  );
}

function findId(rootId: string, path: string): string | null {
  const steps = path.split("/").slice(1).map(Number);
  let id = rootId;
  for (const step of steps) {
    const metric = METRICS[id];
    if (!metric || metric.inputs[step] == null) {
      return null;
    }
    id = metric.inputs[step];
  }
  return id;
}

function InfoPanel({
  rootId,
  selectedPath,
  onReroot,
  onClose,
}: {
  rootId: string;
  selectedPath: string;
  onReroot: (id: string) => void;
  onClose: () => void;
}) {
  const { select } = useContext(TreeContext);
  const id = selectedPath === "" ? null : findId(rootId, selectedPath);
  if (id == null) {
    return null;
  }

  const info = describe(id);
  const series = seriesOf(id);
  const isMetric = info.kind === "metric";
  const metric = METRICS[id];
  const measure = isMetric ? null : getMeasure(id.slice(8).split("|")[0]);
  const usedIn = Object.values(METRICS).filter((candidate) =>
    candidate.inputs.includes(id),
  );

  return (
    <Panel position="top-right">
      <Card className={S.infoPanel} withBorder>
        <Group className={S.panelHeader} p="xl" gap="0.75rem" wrap="nowrap">
          <Center
            w="2.75rem"
            h="2.75rem"
            bdrs="50%"
            bg="background_page-secondary"
          >
            <FixedSizeIcon
              name={isMetric ? "metric" : "ruler"}
              c="core-brand"
              size={20}
            />
          </Center>
          <Stack gap="xxs" flex={1} miw={0}>
            <Title order={3} lh="1.5rem">
              {info.name}
            </Title>
            <Text fz="sm" c="text-secondary">
              {isMetric ? "Metric / Sales" : `Measure / ${measure?.table}`}
            </Text>
          </Stack>
          <ActionIcon variant="subtle" aria-label="Close" onClick={onClose}>
            <FixedSizeIcon name="close" />
          </ActionIcon>
        </Group>

        <Stack p="xl" gap="lg" style={{ overflow: "auto" }}>
          <Box>
            <Text fz={28} fw={700} lh={1.2}>
              {formatValue(id, series.at(-1) ?? 0)}
            </Text>
            <Text fz="sm" c="text-secondary">
              December, by Created At: Month
            </Text>
          </Box>
          <Box c="core-brand">
            <LineChart values={series} width={360} height={140} />
          </Box>

          <Stack gap="sm">
            <Text fz="sm" fw={700} c="text-secondary">
              {isMetric ? "Definition" : "Source"}
            </Text>
            {isMetric ? (
              <Group gap="xs">
                {metric.inputs.map((input, i) => (
                  <Group key={input} gap="xs" wrap="nowrap">
                    {i > 0 && (
                      <Text fw={700} c="text-secondary">
                        {opOf(metric, i)}
                      </Text>
                    )}
                    <UnstyledButton
                      className={S.term}
                      fz="sm"
                      onClick={() => select(`${selectedPath}/${i}`)}
                    >
                      <FixedSizeIcon
                        name={METRICS[input] ? "metric" : "ruler"}
                        size={12}
                        c="text-secondary"
                      />
                      {describe(input).name}
                    </UnstyledButton>
                  </Group>
                ))}
              </Group>
            ) : (
              <Group gap="sm" wrap="nowrap">
                <FixedSizeIcon name="table" c="text-secondary" />
                <Text fz="sm">
                  {measure?.aggregation} of {measure?.table}
                </Text>
              </Group>
            )}
          </Stack>

          <Stack gap="xs">
            <Text fz="sm" fw={700} c="text-secondary">
              Used in
            </Text>
            {usedIn.length === 0 ? (
              <Text fz="sm" c="text-secondary">
                Not used in other metrics yet
              </Text>
            ) : (
              usedIn.map((parent) => (
                <UnstyledButton
                  key={parent.id}
                  className={S.listRow}
                  px="sm"
                  py="xs"
                  onClick={() => onReroot(parent.id)}
                >
                  <Group gap="sm" wrap="nowrap">
                    <FixedSizeIcon name="metric" c="core-brand" />
                    <Text fz="sm" fw={700} flex={1}>
                      {parent.name}
                    </Text>
                    <FixedSizeIcon name="chevronright" c="text-secondary" />
                  </Group>
                </UnstyledButton>
              ))
            )}
          </Stack>

          <Group gap="sm">
            {isMetric && selectedPath !== "root" && (
              <Button variant="filled" onClick={() => onReroot(id)}>
                Show its tree
              </Button>
            )}
            <Button>{isMetric ? "Open metric" : "Open measure"}</Button>
          </Group>
        </Stack>
      </Card>
    </Panel>
  );
}
