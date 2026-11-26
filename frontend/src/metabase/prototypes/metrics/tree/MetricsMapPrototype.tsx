import "@xyflow/react/dist/style.css";
import dagre from "@dagrejs/dagre";
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
  useReactFlow,
} from "@xyflow/react";
import cx from "classnames";
import { createContext, useContext, useMemo, useState } from "react";

import { PageContainer } from "metabase/common/data-studio/components/PageContainer";
import {
  PaneHeader,
  PanelHeaderTitle,
} from "metabase/common/data-studio/components/PaneHeader";
import {
  ActionIcon,
  Box,
  Button,
  Card,
  Center,
  FixedSizeIcon,
  Group,
  Icon,
  Stack,
  Text,
  TextInput,
  Title,
  UnstyledButton,
  useColorScheme,
} from "metabase/ui";

import { LineChart } from "../Sparkline";
import { MONTHS, formatNumber } from "../data";

import S from "./MetricTreeHiFi.module.css";
import type { Operator } from "./MetricTreePrototype";
import M from "./MetricsMap.module.css";

const NODE_W = 300;
const NODE_H = 150;
const OP_RADIUS = 14;
const OP_OFFSET = 32;

type Format = "number" | "currency" | "percent";

type KpiDef = {
  id: string;
  name: string;
  /** A metric's category, or a measure's table. */
  category: string;
  format: Format;
} & (
  | { kind: "measure"; source: string; series: number[] }
  | { kind: "metric"; inputs: string[]; ops: Operator[] }
);

const wave = (start: number, step: number, wobble: number) =>
  MONTHS.map((_, i) => start + step * i + wobble * Math.sin(i * 1.3));

const measure = (
  id: string,
  name: string,
  table: string,
  format: Format,
  aggregation: string,
  series: number[],
): KpiDef => ({
  id,
  name,
  category: table,
  format,
  kind: "measure",
  source: `${table} · ${aggregation}`,
  series,
});

/** `ops[i]` is the operator in front of input `i`; the first one is unused. */
const metric = (
  id: string,
  name: string,
  category: string,
  format: Format,
  inputs: string[],
  ops: Operator[],
): KpiDef => ({ id, name, category, format, kind: "metric", inputs, ops });

/**
 * Every metric in the instance and the measures they use. A metric is math
 * over measures, other metrics, or a mix of both.
 */
const KPIS: Record<string, KpiDef> = Object.fromEntries(
  [
    metric(
      "total-revenue",
      "Total revenue",
      "Finance",
      "currency",
      ["net-revenue", "mrr"],
      ["+", "+"],
    ),
    metric(
      "net-revenue",
      "Net revenue",
      "Sales",
      "currency",
      ["gross-revenue", "discounts"],
      ["+", "−"],
    ),
    metric(
      "revenue-per-new-customer",
      "Revenue per new customer",
      "Sales",
      "currency",
      ["gross-revenue", "new-customers"],
      ["+", "÷"],
    ),
    metric(
      "gross-revenue",
      "Gross revenue",
      "Sales",
      "currency",
      ["orders", "average-order-value"],
      ["+", "×"],
    ),
    metric(
      "orders",
      "Orders",
      "Sales",
      "number",
      ["new-customers", "returning-orders"],
      ["+", "+"],
    ),
    metric(
      "conversion-rate",
      "Conversion rate",
      "Marketing",
      "percent",
      ["new-customers", "visitors"],
      ["+", "÷"],
    ),
    metric(
      "mrr",
      "MRR",
      "Subscriptions",
      "currency",
      ["seats", "price-per-seat"],
      ["+", "×"],
    ),
    metric(
      "trial-conversion-rate",
      "Trial conversion rate",
      "Subscriptions",
      "percent",
      ["converted-trials", "trials"],
      ["+", "÷"],
    ),
    measure(
      "discounts",
      "Discounts",
      "Orders",
      "currency",
      "Sum of Discount",
      wave(8200, 150, 600),
    ),
    measure(
      "average-order-value",
      "Average order value",
      "Orders",
      "currency",
      "Average of Total",
      wave(68, 0.6, 3),
    ),
    measure(
      "new-customers",
      "New customers",
      "People",
      "number",
      "Count, first order this month",
      wave(1000, 30, 70),
    ),
    measure(
      "returning-orders",
      "Returning orders",
      "Orders",
      "number",
      "Count, repeat customer",
      wave(620, 25, 50),
    ),
    measure(
      "visitors",
      "Visitors",
      "Sessions",
      "number",
      "Distinct visitors",
      wave(48000, 1500, 2500),
    ),
    measure(
      "seats",
      "Seats",
      "Accounts",
      "number",
      "Sum of Seats",
      wave(1900, 70, 120),
    ),
    measure(
      "price-per-seat",
      "Price per seat",
      "Plans",
      "currency",
      "Average of Price",
      wave(42, 0.2, 0.6),
    ),
    measure(
      "converted-trials",
      "Converted trials",
      "Accounts",
      "number",
      "Count, trial converted",
      wave(120, 5, 12),
    ),
    measure(
      "trials",
      "Trials",
      "Accounts",
      "number",
      "Count, trial started",
      wave(380, 12, 30),
    ),
  ].map((def) => [def.id, def]),
);

const kindCount = (kind: KpiDef["kind"]) =>
  Object.values(KPIS).filter((def) => def.kind === kind).length;

const COUNT_LABEL = `${kindCount("metric")} metrics · ${kindCount("measure")} measures`;

const apply = (a: number, op: Operator, b: number) =>
  op === "+" ? a + b : op === "−" ? a - b : op === "×" ? a * b : a / b;

function seriesOf(id: string): number[] {
  const def = KPIS[id];
  if (def.kind === "measure") {
    return def.series;
  }
  const inputs = def.inputs.map(seriesOf);
  return inputs[0].map((first, month) =>
    inputs
      .slice(1)
      .reduce((acc, s, j) => apply(acc, def.ops[j + 1], s[month]), first),
  );
}

const FORMATTERS: Record<Format, (value: number) => string> = {
  number: (value) => formatNumber(Math.round(value)),
  currency: (value) =>
    Math.abs(value) >= 1000
      ? `$${formatNumber(Math.round(value))}`
      : `$${value.toFixed(2)}`,
  percent: (value) => `${(value * 100).toFixed(1)}%`,
};

const formatKpi = (id: string, value: number) =>
  FORMATTERS[KPIS[id].format](value);

const inputsOf = (id: string) => {
  const def = KPIS[id];
  return def.kind === "metric" ? def.inputs : [];
};

const usedIn = (id: string) =>
  Object.values(KPIS).filter((def) => inputsOf(def.id).includes(id));

const definitionOf = (id: string) => {
  const def = KPIS[id];
  if (def.kind === "measure") {
    return def.source;
  }
  return def.inputs
    .map((input, i) =>
      i === 0 ? KPIS[input].name : `${def.ops[i]} ${KPIS[input].name}`,
    )
    .join(" ");
};

function collect(id: string, next: (id: string) => string[]): Set<string> {
  const seen = new Set<string>();
  const walk = (current: string) =>
    next(current).forEach((other) => {
      if (!seen.has(other)) {
        seen.add(other);
        walk(other);
      }
    });
  walk(id);
  return seen;
}

type KpiNodeData = { id: string; inputCount: number };
type KpiNode = Node<KpiNodeData, "kpi">;
type KpiEdgeData = { op: Operator | null; highlighted: boolean };
type KpiEdge = Edge<KpiEdgeData, "kpi">;

/**
 * Top down: a metric sits above the metrics it's built from. A metric used by
 * several others is a single card with an edge to each of them.
 */
function buildGraph(): { nodes: KpiNode[]; edges: KpiEdge[] } {
  const graph = new dagre.graphlib.Graph();
  graph.setGraph({ rankdir: "TB", nodesep: 48, ranksep: 96 });
  graph.setDefaultEdgeLabel(() => ({}));
  Object.keys(KPIS).forEach((id) =>
    graph.setNode(id, { width: NODE_W, height: NODE_H }),
  );
  Object.keys(KPIS).forEach((id) =>
    inputsOf(id).forEach((input) => graph.setEdge(id, input)),
  );
  dagre.layout(graph);

  const centerOf = (id: string) => graph.node(id);

  const nodes: KpiNode[] = Object.keys(KPIS).map((id) => {
    const { x, y } = centerOf(id);
    return {
      id,
      type: "kpi",
      position: { x: x - NODE_W / 2, y: y - NODE_H / 2 },
      data: { id, inputCount: inputsOf(id).length },
    };
  });

  // Each input enters its metric at its own point, ordered left to right like
  // the cards below, so edges don't cross under the card.
  const edges: KpiEdge[] = Object.values(KPIS).flatMap((def) => {
    if (def.kind === "measure") {
      return [];
    }
    const byX = [...def.inputs].sort((a, b) => centerOf(a).x - centerOf(b).x);
    return def.inputs.map((input, i) => ({
      id: `${input}->${def.id}`,
      source: input,
      target: def.id,
      targetHandle: `in-${byX.indexOf(input)}`,
      type: "kpi",
      data: { op: i === 0 ? null : def.ops[i], highlighted: false },
    }));
  });

  return { nodes, edges };
}

type MapContextValue = {
  selectedId: string | null;
  select: (id: string | null) => void;
  isDimmed: (id: string) => boolean;
};

const MapContext = createContext<MapContextValue>({
  selectedId: null,
  select: () => {},
  isDimmed: () => false,
});

const NODE_TYPES = { kpi: KpiCard };
const EDGE_TYPES = { kpi: KpiEdgeLine };

/**
 * Every metric on one canvas, top down: each metric above the metrics it's
 * built from, so the whole set reads as a KPI tree. Select a card to light up
 * what drives it and what it drives.
 */
export function MetricsMapPrototype() {
  return (
    <Box
      bd="1px solid var(--mb-color-border-neutral)"
      style={{ borderRadius: 8, overflow: "hidden" }}
    >
      <PageContainer pt="md" h="auto">
        <PaneHeader
          icon="metric"
          breadcrumbs={
            <Text size="sm" c="text-secondary">
              Library
            </Text>
          }
          title={<PanelHeaderTitle>Metrics</PanelHeaderTitle>}
          menu={
            <Text fz="sm" c="text-secondary">
              How all your metrics relate, as of December
            </Text>
          }
        />
        <Card withBorder shadow="none" p={0} h={760}>
          <MetricsMap />
        </Card>
      </PageContainer>
    </Box>
  );
}

function MetricsMap() {
  const { colorScheme } = useColorScheme();
  const graph = useMemo(buildGraph, []);
  const [nodes, , onNodesChange] = useNodesState<KpiNode>(graph.nodes);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const upstream = useMemo(
    () => (selectedId ? collect(selectedId, inputsOf) : new Set<string>()),
    [selectedId],
  );
  const downstream = useMemo(
    () =>
      selectedId
        ? collect(selectedId, (id) => usedIn(id).map((def) => def.id))
        : new Set<string>(),
    [selectedId],
  );

  const edges = useMemo(
    () =>
      graph.edges.map((edge): KpiEdge => {
        const inChain = (set: Set<string>) =>
          (set.has(edge.source) || edge.source === selectedId) &&
          (set.has(edge.target) || edge.target === selectedId);
        return {
          ...edge,
          data: {
            op: edge.data?.op ?? null,
            highlighted:
              selectedId != null && (inChain(upstream) || inChain(downstream)),
          },
        };
      }),
    [graph.edges, selectedId, upstream, downstream],
  );

  const normalizedQuery = query.trim().toLowerCase();
  const isDimmed = (id: string) => {
    const isUnrelated =
      selectedId != null &&
      id !== selectedId &&
      !upstream.has(id) &&
      !downstream.has(id);
    const isFilteredOut =
      normalizedQuery !== "" &&
      !KPIS[id].name.toLowerCase().includes(normalizedQuery);
    return isUnrelated || isFilteredOut;
  };

  return (
    <MapContext.Provider
      value={{ selectedId, select: setSelectedId, isDimmed }}
    >
      <Box className={S.canvas}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={NODE_TYPES}
          edgeTypes={EDGE_TYPES}
          onNodesChange={onNodesChange}
          onPaneClick={() => setSelectedId(null)}
          proOptions={{ hideAttribution: true }}
          colorMode={colorScheme === "dark" ? "dark" : "light"}
          fitView
          fitViewOptions={{ padding: 0.1, maxZoom: 0.9 }}
          minZoom={0.15}
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
          <Panel position="top-left">
            <Group className={M.toolbar} gap="sm" wrap="nowrap">
              <TextInput
                className={M.search}
                size="sm"
                placeholder="Search metrics"
                leftSection={<Icon name="search" />}
                value={query}
                onChange={(event) => setQuery(event.currentTarget.value)}
              />
              <Text fz="sm" c="text-secondary" pr="sm">
                {COUNT_LABEL}
              </Text>
            </Group>
          </Panel>
          <InfoPanel />
        </ReactFlow>
      </Box>
    </MapContext.Provider>
  );
}

function KpiCard({ data }: NodeProps<KpiNode>) {
  const { selectedId, select, isDimmed } = useContext(MapContext);
  const def = KPIS[data.id];
  const series = seriesOf(data.id);
  const current = series.at(-1) ?? 0;
  const previous = series.at(-2) ?? current;
  const change = previous === 0 ? 0 : (current - previous) / Math.abs(previous);
  const isUp = change >= 0;

  return (
    <Stack
      className={cx(S.card, {
        [S.selected]: selectedId === data.id,
        [M.dimmed]: isDimmed(data.id),
        [M.metricCard]: def.kind === "metric",
        [M.measureCard]: def.kind === "measure",
        [M.measureSelected]: selectedId === data.id,
      })}
      w={NODE_W}
      gap={0}
      onClick={() => select(data.id)}
    >
      <Handle
        type="source"
        position={Position.Top}
        className={S.handle}
        isConnectable={false}
      />
      <Group className={S.header} gap="sm" px="lg" py="md" wrap="nowrap">
        <FixedSizeIcon
          name={def.kind === "metric" ? "metric" : "ruler"}
          c={def.kind === "metric" ? "core-brand" : "core-summarize"}
          size={14}
        />
        <Box fz={16} fw={700} c="text-primary" className={S.truncate}>
          {def.name}
        </Box>
      </Group>
      <Group className={S.row} px="lg" py="sm" gap="md" wrap="nowrap">
        <Stack gap={0} flex={1} miw={0}>
          <Text fz={22} fw={700} lh={1.2} c="text-primary">
            {formatKpi(data.id, current)}
          </Text>
          <Group
            gap={2}
            wrap="nowrap"
            c={isUp ? "feedback-positive" : "feedback-negative"}
          >
            <FixedSizeIcon name={isUp ? "arrow_up" : "arrow_down"} size={10} />
            <Text fz="xs" fw={700} c="inherit">
              {(Math.abs(change) * 100).toFixed(1)}%
            </Text>
            <Text fz="xs" c="text-secondary" ml={4}>
              MoM
            </Text>
          </Group>
        </Stack>
        <Box w={96} c="core-brand">
          <LineChart values={series} width={96} height={32} showAxes={false} />
        </Box>
      </Group>
      <Group className={S.row} px="lg" gap="sm" wrap="nowrap">
        <FixedSizeIcon
          name={def.kind === "metric" ? "function" : "table"}
          c="text-secondary"
          size={14}
        />
        <Text fz="sm" c="text-secondary" className={S.truncate}>
          {definitionOf(data.id)}
        </Text>
      </Group>
      {Array.from({ length: data.inputCount }, (_, i) => (
        <Handle
          key={i}
          id={`in-${i}`}
          type="target"
          position={Position.Bottom}
          className={S.handle}
          isConnectable={false}
          style={{ left: `${((i + 1) * 100) / (data.inputCount + 1)}%` }}
        />
      ))}
    </Stack>
  );
}

function KpiEdgeLine(props: EdgeProps<KpiEdge>) {
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
          transform={`translate(${props.targetX}, ${props.targetY + OP_OFFSET})`}
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

function InfoPanel() {
  const { selectedId, select } = useContext(MapContext);
  const { setCenter, getZoom } = useReactFlow();
  if (selectedId == null) {
    return null;
  }

  const def = KPIS[selectedId];
  const series = seriesOf(selectedId);
  const parents = usedIn(selectedId);

  const focus = (id: string) => {
    select(id);
    const node = nodePositions[id];
    setCenter(node.x, node.y, { zoom: getZoom(), duration: 400 });
  };

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
              name={def.kind === "metric" ? "metric" : "ruler"}
              c={def.kind === "metric" ? "core-brand" : "core-summarize"}
              size={20}
            />
          </Center>
          <Stack gap="xxs" flex={1} miw={0}>
            <Title order={3} lh="1.5rem">
              {def.name}
            </Title>
            <Text fz="sm" c="text-secondary">
              {def.kind === "metric" ? "Metric" : "Measure"} / {def.category}
            </Text>
          </Stack>
          <ActionIcon
            variant="subtle"
            aria-label="Close"
            onClick={() => select(null)}
          >
            <FixedSizeIcon name="close" />
          </ActionIcon>
        </Group>

        <Stack p="xl" gap="lg" style={{ overflow: "auto" }}>
          <Box>
            <Text fz={28} fw={700} lh={1.2}>
              {formatKpi(selectedId, series.at(-1) ?? 0)}
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
              Built from
            </Text>
            {def.kind === "metric" ? (
              <Group gap="xs">
                {def.inputs.map((input, i) => (
                  <Group key={input} gap="xs" wrap="nowrap">
                    {i > 0 && (
                      <Text fw={700} c="text-secondary">
                        {def.ops[i]}
                      </Text>
                    )}
                    <UnstyledButton
                      className={S.term}
                      fz="sm"
                      onClick={() => focus(input)}
                    >
                      <FixedSizeIcon
                        name={
                          KPIS[input].kind === "metric" ? "metric" : "ruler"
                        }
                        size={12}
                        c="text-secondary"
                      />
                      {KPIS[input].name}
                    </UnstyledButton>
                  </Group>
                ))}
              </Group>
            ) : (
              <Group gap="sm" wrap="nowrap">
                <FixedSizeIcon name="table" c="text-secondary" />
                <Text fz="sm">{def.source}</Text>
              </Group>
            )}
          </Stack>

          <Stack gap="xs">
            <Text fz="sm" fw={700} c="text-secondary">
              Drives
            </Text>
            {parents.length === 0 ? (
              <Text fz="sm" c="text-secondary">
                Nothing is built from it yet
              </Text>
            ) : (
              parents.map((parent) => (
                <UnstyledButton
                  key={parent.id}
                  className={S.listRow}
                  px="sm"
                  py="xs"
                  onClick={() => focus(parent.id)}
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
            <Button variant="filled">Open metric</Button>
          </Group>
        </Stack>
      </Card>
    </Panel>
  );
}

/** Card centers, for panning to a metric picked in the panel. */
const nodePositions: Record<string, { x: number; y: number }> =
  Object.fromEntries(
    buildGraph().nodes.map((node) => [
      node.id,
      { x: node.position.x + NODE_W / 2, y: node.position.y + NODE_H / 2 },
    ]),
  );
