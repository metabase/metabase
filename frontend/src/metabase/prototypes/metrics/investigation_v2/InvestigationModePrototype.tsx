import "@xyflow/react/dist/style.css";
import {
  Background,
  type Edge,
  type EdgeProps,
  Handle,
  type Node,
  type NodeProps,
  Position,
  ReactFlow,
  ReactFlowProvider,
  getSmoothStepPath,
  useReactFlow,
} from "@xyflow/react";
import cx from "classnames";
import { createContext, useContext, useEffect, useMemo, useState } from "react";

import { PillTabNavigation } from "metabase/common/components/PillTabNavigation";
import { PageContainer } from "metabase/common/data-studio/components/PageContainer";
import {
  PaneHeader,
  PanelHeaderTitle,
} from "metabase/common/data-studio/components/PaneHeader";
import {
  ActionIcon,
  Box,
  Breadcrumbs,
  Button,
  Card,
  FixedSizeIcon,
  Group,
  Icon,
  Select,
  SelectItem,
  Stack,
  Text,
  UnstyledButton,
  useColorScheme,
} from "metabase/ui";

import { LineChart } from "../Sparkline";
import T from "../tree/MetricTreeHiFi.module.css";
import M from "../tree/MetricsMap.module.css";

import { ExplorerModal } from "./ExplorerModal";
import S from "./Investigation.module.css";
import { TrendChart } from "./TrendChart";
import {
  type BreakoutTab,
  type InvestigationNode,
  type Mover,
  NODES,
  type Operator,
  PERIODS,
  ROOT_ID,
  SEGMENT_TAB_ID,
  SERIES_COLORS,
  breakoutSeriesOf,
  comparisonSeriesOf,
  formatPct,
  formatValue,
  isUniform,
  moversOf,
  restDeltaOf,
  seriesOf,
} from "./data";

const TABS = ["About", "Overview", "Definition", "Dimensions", "Dependencies"];
const NODE_W = 300;
const NODE_H = 150;
const COL_GAP = 120;
const ROW_GAP = 32;

type Filter = { tabId: string; prefix: string; label: string };
type Slice = Pick<Filter, "tabId" | "label">;

const ALL_TAB = "all";
const TOP_MOVERS = 6;

/** A node's numbers, in the focused slice if there is one. */
type View = {
  previous: number;
  current: number;
  delta: number;
  verdict: string;
  scale: number;
  /** The slice the numbers are for; null when they are the whole node's. */
  slice: string | null;
};

function viewOf(node: InvestigationNode, filter: Filter | null): View {
  const delta = (node.current - node.previous) / node.previous;
  const item = filter
    ? node.breakouts
        .find((tab) => tab.id === filter.tabId)
        ?.items.find((candidate) => candidate.label === filter.label)
    : undefined;
  if (!item) {
    return {
      ...node,
      delta,
      verdict: biggestMoveOf(node, delta),
      scale: 1,
      slice: null,
    };
  }
  const previous = node.previous * item.share;
  return {
    previous,
    current: previous * (1 + item.delta),
    delta: item.delta,
    verdict: `Overall ${formatValue(node, node.current)} · ${formatPct(delta)}`,
    scale: item.share,
    slice: item.label,
  };
}

/** The view's monthly values: the node's, scaled to the slice and ending on its number. */
function seriesOfView(node: InvestigationNode, view: View): number[] {
  const values = seriesOf(node, view.scale);
  return [...values.slice(0, -1), view.current];
}

/** Marks numbers that are for the focused slice, not the whole node. */
function SliceTag({ label }: { label: string }) {
  return (
    <Text
      className={S.sliceTag}
      fz="xs"
      fw={700}
      lh={1.5}
      px="xs"
      bg="core-brand"
      c="text-primary-inverse"
    >
      {label}
    </Text>
  );
}

/** The slice behind most of the change, or the node's own verdict when none stands out. */
function biggestMoveOf(node: InvestigationNode, overall: number): string {
  const [top] = moversOf(node);
  return top && !isUniform(node)
    ? `${formatPct(top.delta, 0)} in ${top.label} vs ${formatPct(overall, 0)} overall`
    : node.verdict;
}

/** How much of the parent's change this term explains, in the parent's units. */
function impactOf(
  parent: InvestigationNode,
  parentView: View,
  childView: View,
  op: Operator | null,
): number {
  if (parent.combine === "product") {
    return parentView.previous * childView.delta;
  }
  const sign = op === "−" ? -1 : 1;
  return sign * (childView.current - childView.previous);
}

type CardData = {
  nodeId: string;
  view: View;
  driverShare: number | null;
  childCount: number;
  expanded: boolean;
};
type CardNode = Node<CardData, "card">;
type LineData = { highlighted: boolean };
type LineEdge = Edge<LineData, "line">;

type InvestigationContextValue = {
  selectedId: string | null;
  select: (id: string) => void;
  toggle: (id: string) => void;
};

const InvestigationContext = createContext<InvestigationContextValue>({
  selectedId: null,
  select: () => {},
  toggle: () => {},
});

/** Root on the left, its terms to the right; only expanded nodes show children. */
function buildGraph(expanded: Set<string>, filter: Filter | null) {
  const nodes: CardNode[] = [];
  const edges: LineEdge[] = [];
  let slot = 0;

  const visit = (id: string, depth: number, driverShare: number | null) => {
    const node = NODES[id];
    const view = viewOf(node, filter);
    const children = node.children ?? [];
    const isExpanded = expanded.has(id) && children.length > 0;
    let y: number;

    if (!isExpanded) {
      y = slot++ * (NODE_H + ROW_GAP);
    } else {
      const change = view.current - view.previous;
      const impacts = children.map(({ id: childId, op }) =>
        impactOf(node, view, viewOf(NODES[childId], filter), op),
      );
      const driverIndex = impacts.reduce(
        (best, impact, i) =>
          impact * Math.sign(change) > impacts[best] * Math.sign(change)
            ? i
            : best,
        0,
      );
      const childYs = children.map(({ id: childId }, i) =>
        visit(
          childId,
          depth + 1,
          i === driverIndex && change !== 0
            ? Math.min(impacts[i] / change, 1)
            : null,
        ),
      );
      y = (childYs[0] + childYs[childYs.length - 1]) / 2;
      children.forEach(({ id: childId }) =>
        edges.push({
          id: `${id}->${childId}`,
          source: id,
          target: childId,
          type: "line",
          data: { highlighted: false },
        }),
      );
    }

    nodes.push({
      id,
      type: "card",
      position: { x: depth * (NODE_W + COL_GAP), y },
      draggable: false,
      data: {
        nodeId: id,
        view,
        driverShare,
        childCount: children.length,
        expanded: isExpanded,
      },
    });
    return y;
  };

  visit(ROOT_ID, 0, null);
  return { nodes, edges };
}

const NODE_TYPES = { card: NodeCard };
const EDGE_TYPES = { line: TermLine };

/**
 * Investigation mode on a metric's Dependencies tab: walk the tree from the
 * metric on the left into its parts to find the branch behind the change.
 */
export function InvestigationModePrototype() {
  return (
    <Box
      bd="1px solid var(--mb-color-border-neutral)"
      style={{ borderRadius: 8, overflow: "hidden" }}
    >
      <PageContainer pt="md" h="auto">
        <PaneHeader
          icon="metric"
          breadcrumbs={
            <Breadcrumbs
              separator={<Icon size={12} name="chevronright" />}
              fz="sm"
              c="text-secondary"
            >
              <Text size="sm" c="inherit">
                Our analytics
              </Text>
            </Breadcrumbs>
          }
          title={<PanelHeaderTitle>Revenue</PanelHeaderTitle>}
          tabs={
            <PillTabNavigation
              tabs={TABS.map((label) => ({
                label,
                onClick: () => undefined,
                isSelected: label === "Dependencies",
              }))}
            />
          }
          menu={
            <Group gap="xs" wrap="nowrap">
              <ActionIcon variant="subtle" c="text-secondary">
                <Icon name="bookmark" />
              </ActionIcon>
              <ActionIcon variant="subtle" c="text-secondary">
                <Icon name="ellipsis" />
              </ActionIcon>
            </Group>
          }
        />
        <ReactFlowProvider>
          <Investigation />
        </ReactFlowProvider>
      </PageContainer>
    </Box>
  );
}

function Investigation() {
  const [period, setPeriod] = useState(PERIODS[0].value);
  const [filter, setFilter] = useState<Filter | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(ROOT_ID);
  const [expanded, setExpanded] = useState(() => new Set([ROOT_ID]));

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });

  const graph = useMemo(() => buildGraph(expanded, filter), [expanded, filter]);
  const selectedPath = new Set(pathTo(selectedId));
  const edges = graph.edges.map((edge) => ({
    ...edge,
    data: {
      highlighted:
        selectedPath.has(edge.source) && selectedPath.has(edge.target),
    },
  }));
  const comparison =
    { month: "last month", quarter: "last quarter", yoy: "last year" }[
      period
    ] ?? "last month";

  return (
    <InvestigationContext.Provider
      value={{ selectedId, select: setSelectedId, toggle }}
    >
      <Card withBorder shadow="none" p={0} h={720}>
        <Stack gap={0} h="100%">
          <Group gap={0} wrap="nowrap" flex={1} mih={0} align="stretch">
            <Box pos="relative" flex={1} miw={0} h="100%">
              <Group
                gap="sm"
                wrap="nowrap"
                pos="absolute"
                top={16}
                left={16}
                style={{ zIndex: 5 }}
              >
                <Select
                  w={220}
                  data={PERIODS}
                  value={period}
                  onChange={(value) => value && setPeriod(value)}
                  leftSection={<FixedSizeIcon name="calendar" />}
                />
                {filter && (
                  <Group
                    className={S.filterChip}
                    gap="xs"
                    pl="md"
                    pr="xs"
                    wrap="nowrap"
                    bg="core-brand"
                    c="text-primary-inverse"
                  >
                    <FixedSizeIcon name="filter" />
                    <Text fw={700} c="inherit">
                      {filter.prefix} {filter.label}
                    </Text>
                    <UnstyledButton
                      className={S.filterChipClear}
                      c="inherit"
                      p="xs"
                      aria-label="Clear filter"
                      onClick={() => setFilter(null)}
                    >
                      <FixedSizeIcon name="close" />
                    </UnstyledButton>
                  </Group>
                )}
              </Group>
              <TreeCanvas nodes={graph.nodes} edges={edges} />
            </Box>
            {selectedId && (
              <SidePanel
                key={selectedId}
                node={NODES[selectedId]}
                filter={filter}
                comparison={comparison}
                periodLabel={
                  PERIODS.find((option) => option.value === period)?.label ?? ""
                }
                onFilter={setFilter}
                onClose={() => setSelectedId(null)}
              />
            )}
          </Group>
        </Stack>
      </Card>
    </InvestigationContext.Provider>
  );
}

function TreeCanvas({
  nodes,
  edges,
}: {
  nodes: CardNode[];
  edges: LineEdge[];
}) {
  const { colorScheme } = useColorScheme();
  const { fitView } = useReactFlow();

  useEffect(() => {
    const frame = requestAnimationFrame(() =>
      fitView({ padding: 0.15, maxZoom: 0.9, duration: 300 }),
    );
    return () => cancelAnimationFrame(frame);
  }, [nodes.length, fitView]);

  return (
    <Box className={S.canvas}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        proOptions={{ hideAttribution: true }}
        colorMode={colorScheme === "dark" ? "dark" : "light"}
        fitView
        fitViewOptions={{ padding: 0.15, maxZoom: 0.9 }}
        minZoom={0.2}
        maxZoom={1.25}
        nodesConnectable={false}
      >
        <Background />
      </ReactFlow>
    </Box>
  );
}

function Delta({ delta, size = "sm" }: { delta: number; size?: string }) {
  return (
    <Group
      gap={2}
      wrap="nowrap"
      c={delta >= 0 ? "feedback-positive" : "feedback-negative"}
    >
      <FixedSizeIcon name={delta >= 0 ? "arrow_up" : "arrow_down"} size={12} />
      <Text fz={size} fw={700} c="inherit">
        {formatPct(delta).slice(1)}
      </Text>
    </Group>
  );
}

function NodeCard({ data }: NodeProps<CardNode>) {
  const { selectedId, select, toggle } = useContext(InvestigationContext);
  const node = NODES[data.nodeId];
  const { view } = data;
  const canToggle = data.childCount > 0 && node.id !== ROOT_ID;
  const isSelected = selectedId === data.nodeId;

  return (
    <Stack
      className={cx(T.card, {
        [M.metricCard]: node.kind === "metric",
        [M.measureCard]: node.kind === "measure",
      })}
      w={NODE_W}
      gap={0}
      style={{
        cursor: "pointer",
        outline: isSelected
          ? "2px solid var(--mb-color-core-brand)"
          : undefined,
      }}
      onClick={() => {
        select(data.nodeId);
        if (canToggle) {
          toggle(data.nodeId);
        }
      }}
    >
      <Handle
        type="target"
        position={Position.Left}
        className={S.handle}
        isConnectable={false}
      />
      <Group className={T.header} gap="sm" px="lg" py="md" wrap="nowrap">
        <FixedSizeIcon
          name={node.kind === "metric" ? "metric" : "ruler"}
          c={node.kind === "metric" ? "core-brand" : "core-summarize"}
          size={14}
        />
        <Box fz={16} fw={700} c="text-primary" flex={1} className={T.truncate}>
          {node.name}
        </Box>
        {view.slice && <SliceTag label={view.slice} />}
      </Group>
      <Group className={T.row} px="lg" py="sm" gap="md" wrap="nowrap">
        <Stack gap={0} flex={1} miw={0}>
          <Text fz={22} fw={700} lh={1.2} c="text-primary">
            {formatValue(node, view.current)}
          </Text>
          <Delta delta={view.delta} size="xs" />
        </Stack>
        <Box w={96} c="core-brand">
          <LineChart
            values={sparklineOf(seriesOfView(node, view))}
            width={96}
            height={32}
            showAxes={false}
          />
        </Box>
      </Group>
      <Group className={T.row} px="lg" gap="sm" wrap="nowrap">
        <Text fz="sm" c="text-secondary" className={T.truncate} flex={1}>
          {view.verdict}
        </Text>
        {canToggle && (
          <Group gap={4} wrap="nowrap" c="text-secondary">
            <Text fz="sm" fw={700} c="inherit">
              {data.childCount}
            </Text>
            <FixedSizeIcon
              name={data.expanded ? "chevronleft" : "chevronright"}
              size={12}
            />
          </Group>
        )}
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

/**
 * The shared sparkline draws from zero, which flattens a few percent of
 * movement. Lift the baseline so the shape of the last months shows.
 */
function sparklineOf(values: number[]): number[] {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const floor = min - (max - min) * 0.25;
  return values.map((value) => value - floor);
}

function TermLine(props: EdgeProps<LineEdge>) {
  const highlighted = props.data?.highlighted ?? false;
  const [path] = getSmoothStepPath({
    sourceX: props.sourceX,
    sourceY: props.sourceY,
    sourcePosition: props.sourcePosition,
    targetX: props.targetX,
    targetY: props.targetY,
    targetPosition: props.targetPosition,
  });

  return (
    <path
      d={path}
      fill="none"
      stroke={
        highlighted
          ? "var(--mb-color-core-brand)"
          : "var(--mb-color-border-neutral-strong)"
      }
      strokeWidth={highlighted ? 2 : 1}
      strokeDasharray={highlighted ? undefined : "6 6"}
    />
  );
}

/** The ids from the root down to `id`. */
function pathTo(id: string | null): string[] {
  if (id == null) {
    return [];
  }
  const parent = Object.values(NODES).find((node) =>
    node.children?.some((child) => child.id === id),
  );
  return parent ? [...pathTo(parent.id), id] : [id];
}

function SidePanel({
  node,
  filter,
  comparison,
  periodLabel,
  onFilter,
  onClose,
}: {
  node: InvestigationNode;
  filter: Filter | null;
  comparison: string;
  periodLabel: string;
  onFilter: (filter: Filter | null) => void;
  onClose: () => void;
}) {
  const [tabId, setTabId] = useState(ALL_TAB);
  const [showAll, setShowAll] = useState(false);
  const [hovered, setHovered] = useState<Slice | null>(null);
  const view = viewOf(node, filter);
  const tab = node.breakouts.find((candidate) => candidate.id === tabId);
  const movers = moversOf(node, tab ? [tab] : node.breakouts);
  const isShort = tab === undefined && !showAll;
  const rows = isShort ? movers.slice(0, TOP_MOVERS) : movers;
  const nothingStandsOut = tab === undefined && isUniform(node);

  const comparedSlice = hovered ?? filter;
  const compared = moversOf(node).find(
    (mover) =>
      mover.tab.id === comparedSlice?.tabId &&
      mover.label === comparedSlice.label,
  );
  // Overlapping segments and a mix of dimensions can't be bars of one whole.
  const hasBars = tab !== undefined && tab.id !== SEGMENT_TAB_ID;

  const [isExplorerOpen, setIsExplorerOpen] = useState(false);

  return (
    <Box className={S.panel}>
      <Group className={S.panelSection} px="xl" py="md" wrap="nowrap">
        <FixedSizeIcon
          name={node.kind === "metric" ? "metric" : "ruler"}
          c={node.kind === "metric" ? "core-brand" : "core-summarize"}
        />
        <Stack gap={0} flex={1} miw={0}>
          <Text fw={700} fz="lg">
            {node.name}
          </Text>
          <Text fz="sm" c="text-secondary">
            {node.kind === "metric" ? "Metric" : "Measure"}
          </Text>
        </Stack>
        <ActionIcon variant="subtle" aria-label="Close" onClick={onClose}>
          <FixedSizeIcon name="close" />
        </ActionIcon>
      </Group>

      {/* Stays put so the chart is in view while hovering the lists below. */}
      <Stack className={S.panelSection} px="xl" pt="lg" pb="md" gap="lg">
        <Stack gap="xs">
          <Group gap="sm" align="baseline">
            <Text fz={24} fw={700} lh={1.1}>
              {formatValue(node, view.current)}
            </Text>
            <Delta delta={view.delta} />
            {view.slice && <SliceTag label={view.slice} />}
            <Text fz="sm" c="text-secondary">
              vs {comparison}
            </Text>
          </Group>
          <Text fz="sm">{view.verdict}</Text>
        </Stack>

        <Box>
          <TrendChart
            values={seriesOf(node, 1)}
            bars={hasBars && !compared ? breakoutSeriesOf(node, tab) : []}
            compare={compared && comparisonSeriesOf(node, compared)}
            annotation={node.annotation}
          />
          {node.annotation.label && (
            <Text fz="xs" c="text-secondary" mt="xs">
              {node.annotation.label}
            </Text>
          )}
        </Box>
      </Stack>

      <Stack px="xl" py="lg" gap="lg" flex={1} style={{ overflow: "auto" }}>
        <Stack gap="sm">
          <Group justify="space-between" wrap="nowrap">
            <Text fw={700}>What moved</Text>
            <Select
              size="sm"
              w={120}
              styles={{ input: { fontSize: "var(--mantine-font-size-sm)" } }}
              renderOption={(item) => (
                <SelectItem selected={item.checked} size="xs">
                  <Text fz="sm" c="inherit" lh="inherit">
                    {item.option.label}
                  </Text>
                </SelectItem>
              )}
              value={tabId}
              onChange={(value) => value && setTabId(value)}
              data={[
                { value: ALL_TAB, label: "Everything" },
                ...node.breakouts.map((breakout) => ({
                  value: breakout.id,
                  label: breakout.label,
                })),
              ]}
            />
          </Group>
          {nothingStandsOut ? (
            <Text fz="sm" c="text-secondary">
              Nothing stands out. Every slice moved about{" "}
              {formatPct(view.delta, 0)}, the same as the whole.
            </Text>
          ) : (
            <MoverRows
              node={node}
              rows={rows}
              hasBars={hasBars}
              filter={filter}
              onFilter={onFilter}
              onHover={setHovered}
            />
          )}
          {isShort && !nothingStandsOut && movers.length > rows.length && (
            <Button
              variant="subtle"
              size="compact-sm"
              style={{ alignSelf: "flex-start" }}
              onClick={() => setShowAll(true)}
            >
              Show all {movers.length}
            </Button>
          )}
        </Stack>
      </Stack>

      <Stack className={S.panelFooter} px="xl" py="md" gap="xs">
        <Button
          variant="default"
          leftSection={<FixedSizeIcon name="external" />}
          onClick={() => setIsExplorerOpen(true)}
        >
          Open in Metric Explorer
        </Button>
      </Stack>
      {isExplorerOpen && (
        <ExplorerModal
          node={node}
          initialTabId={tab?.id}
          filter={filter}
          periodLabel={periodLabel}
          onClose={() => setIsExplorerOpen(false)}
        />
      )}
    </Box>
  );
}

/**
 * Slices of a node, each read against everyone outside it. Clicking one
 * focuses the tree on it; hovering one compares the two on the trend chart.
 */
function MoverRows({
  node,
  rows,
  hasBars,
  filter,
  onFilter,
  onHover,
}: {
  node: InvestigationNode;
  rows: Mover[];
  /** The rows are the chart's bars, so each carries its bar's colour. */
  hasBars: boolean;
  filter: Filter | null;
  onFilter: (filter: Filter | null) => void;
  onHover: (slice: Slice | null) => void;
}) {
  const change = node.current - node.previous;
  const maxImpact = Math.max(
    ...rows.flatMap((row) => [
      Math.abs(row.impact),
      Math.abs(change - row.impact),
    ]),
    1e-9,
  );

  return (
    <Stack gap={2} onMouseLeave={() => onHover(null)}>
      <Group gap="sm" px="sm" justify="flex-end" wrap="nowrap">
        <Text fz="xs" c="text-secondary" w={EFFECT_W} ta="right">
          Effect
        </Text>
        <Text fz="xs" c="text-secondary" w={CHANGE_W} ta="right">
          Change
        </Text>
      </Group>
      {rows.map((row) => {
        const active =
          filter?.tabId === row.tab.id && filter.label === row.label;
        return (
          <UnstyledButton
            key={`${row.tab.id}:${row.label}`}
            className={cx(S.breakoutRow, { [S.active]: active })}
            px="sm"
            py="xs"
            onMouseEnter={() =>
              onHover({ tabId: row.tab.id, label: row.label })
            }
            onClick={() =>
              onFilter(
                active
                  ? null
                  : {
                      tabId: row.tab.id,
                      prefix: row.tab.filterPrefix,
                      label: row.label,
                    },
              )
            }
          >
            <Group gap="sm" wrap="nowrap">
              <Group gap="sm" w={LABEL_W} wrap="nowrap">
                {hasBars ? (
                  <Box
                    w={8}
                    h={8}
                    mx={2}
                    style={{
                      flexShrink: 0,
                      borderRadius: "50%",
                      background:
                        SERIES_COLORS[row.index % SERIES_COLORS.length],
                    }}
                  />
                ) : (
                  <Box className={S.sliceSwatch} />
                )}
                <Text
                  fz="sm"
                  lh={1.25}
                  fw={active ? 700 : undefined}
                  className={S.truncate}
                >
                  {row.label}
                </Text>
              </Group>
              <ImpactBar impact={row.impact} maxImpact={maxImpact} />
              <Text
                fz="sm"
                lh={1.25}
                fw={700}
                w={EFFECT_W}
                ta="right"
                c={row.impact >= 0 ? "feedback-positive" : "feedback-negative"}
              >
                {formatEffect(node, row.impact)}
              </Text>
              <Text
                fz="sm"
                lh={1.25}
                w={CHANGE_W}
                ta="right"
                c={row.delta >= 0 ? "feedback-positive" : "feedback-negative"}
              >
                {formatPct(row.delta, 0)}
              </Text>
            </Group>
            <Group gap="sm" wrap="nowrap">
              <Group gap="sm" w={LABEL_W} wrap="nowrap">
                <Box className={S.restSwatch} />
                <Text
                  fz="xs"
                  lh={1.25}
                  c="text-secondary"
                  className={S.truncate}
                >
                  {restLabelOf(row.tab)}
                </Text>
              </Group>
              <ImpactBar
                impact={change - row.impact}
                maxImpact={maxImpact}
                muted
              />
              <Text
                fz="xs"
                lh={1.25}
                c="text-secondary"
                w={EFFECT_W}
                ta="right"
              >
                {formatEffect(node, change - row.impact)}
              </Text>
              <Text
                fz="xs"
                lh={1.25}
                c="text-secondary"
                w={CHANGE_W}
                ta="right"
              >
                {formatPct(restDeltaOf(node, row), 0)}
              </Text>
            </Group>
          </UnstyledButton>
        );
      })}
    </Stack>
  );
}

const LABEL_W = 136;
const EFFECT_W = 48;
const CHANGE_W = 44;

/** A part of the node's change in the node's own units, signed and rounded to fit a narrow column. */
function formatEffect(node: InvestigationNode, impact: number): string {
  const sign = impact >= 0 ? "+" : "−";
  const size = Math.abs(impact);
  if (node.format === "count") {
    return `${sign}${Math.round(size).toLocaleString("en-US")}`;
  }
  if (size >= 1_000_000) {
    return `${sign}$${(size / 1_000_000).toFixed(1)}M`;
  }
  if (size >= 1_000) {
    return `${sign}$${Math.round(size / 1_000)}k`;
  }
  return `${sign}$${size >= 10 ? Math.round(size) : size.toFixed(2)}`;
}

/** Names what a slice is compared with, which also says what kind of slice it is. */
const restLabelOf = (tab: BreakoutTab) =>
  tab.id === SEGMENT_TAB_ID
    ? "Everyone else"
    : `Other ${tab.label.toLowerCase()}s`;

/** A part of the node's change, drawn from the centre: left is down, right is up. */
function ImpactBar({
  impact,
  maxImpact,
  muted = false,
}: {
  impact: number;
  maxImpact: number;
  muted?: boolean;
}) {
  const width = `${(Math.abs(impact) / maxImpact) * 50}%`;
  return (
    <Box className={cx(S.barTrack, { [S.thin]: muted })}>
      <Box className={S.barAxis} />
      <Box
        className={S.bar}
        bg={impact >= 0 ? "feedback-positive" : "feedback-negative"}
        opacity={muted ? 0.4 : 1}
        style={impact >= 0 ? { left: "50%", width } : { right: "50%", width }}
      />
    </Box>
  );
}
