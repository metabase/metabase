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
import { useDispatch } from "metabase/redux";
import { addUndo } from "metabase/redux/undo";
import {
  ActionIcon,
  Badge,
  Box,
  Breadcrumbs,
  Button,
  Card,
  FixedSizeIcon,
  Group,
  Icon,
  SegmentedControl,
  Select,
  Stack,
  Text,
  UnstyledButton,
  useColorScheme,
} from "metabase/ui";

import { LineChart } from "../Sparkline";
import T from "../tree/MetricTreeHiFi.module.css";
import M from "../tree/MetricsMap.module.css";

import S from "./Investigation.module.css";
import { TrendChart } from "./TrendChart";
import {
  type InvestigationNode,
  NODES,
  type Operator,
  PERIODS,
  ROOT_ID,
  formatPct,
  formatValue,
  seriesOf,
} from "./data";

const TABS = ["About", "Overview", "Definition", "Dimensions", "Dependencies"];
const NODE_W = 300;
const NODE_H = 150;
const COL_GAP = 120;
const ROW_GAP = 32;

type Filter = { tabId: string; prefix: string; label: string };

/** A node's numbers, in the focused slice if there is one. */
type View = {
  previous: number;
  current: number;
  delta: number;
  verdict: string;
  scale: number;
};

function viewOf(node: InvestigationNode, filter: Filter | null): View {
  const delta = (node.current - node.previous) / node.previous;
  const item = filter
    ? node.breakouts
        .find((tab) => tab.id === filter.tabId)
        ?.items.find((candidate) => candidate.label === filter.label)
    : undefined;
  if (!item) {
    return { ...node, delta, scale: 1 };
  }
  const previous = node.previous * item.share;
  return {
    previous,
    current: previous * (1 + item.delta),
    delta: item.delta,
    verdict: `${formatPct(item.delta, 0)} in ${item.label} vs ${formatPct(delta, 0)} overall`,
    scale: item.share,
  };
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
  const comparison = period === "yoy" ? "last November" : "October";

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
                  w={260}
                  data={PERIODS}
                  value={period}
                  onChange={(value) => value && setPeriod(value)}
                  leftSection={<FixedSizeIcon name="calendar" />}
                />
                {filter && (
                  <Badge
                    size="lg"
                    variant="light"
                    rightSection={
                      <ActionIcon
                        size="xs"
                        variant="transparent"
                        aria-label="Remove filter"
                        onClick={() => setFilter(null)}
                      >
                        <FixedSizeIcon name="close" size={10} />
                      </ActionIcon>
                    }
                    style={{ textTransform: "none" }}
                  >
                    {filter.prefix} {filter.label}
                  </Badge>
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
        {data.driverShare != null && (
          <Badge
            variant="light"
            color="brand"
            style={{ textTransform: "none" }}
          >
            Biggest driver · {Math.round(data.driverShare * 100)}%
          </Badge>
        )}
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
            values={sparklineOf(seriesOf(node, view.scale))}
            width={96}
            height={32}
            showAxes={false}
          />
        </Box>
      </Group>
      <Group className={T.row} px="lg" gap="sm" wrap="nowrap">
        <FixedSizeIcon name="insight" c="text-secondary" size={14} />
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
  onFilter,
  onClose,
}: {
  node: InvestigationNode;
  filter: Filter | null;
  comparison: string;
  onFilter: (filter: Filter | null) => void;
  onClose: () => void;
}) {
  const dispatch = useDispatch();
  const [tabId, setTabId] = useState(node.breakouts[0].id);
  const view = viewOf(node, filter);
  const tab =
    node.breakouts.find((candidate) => candidate.id === tabId) ??
    node.breakouts[0];
  const rows = tab.items
    .map((item) => ({
      ...item,
      impact: node.previous * item.share * item.delta,
    }))
    .sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact));
  const maxImpact = Math.max(...rows.map((row) => Math.abs(row.impact)), 1e-9);

  const carried = [
    node.name,
    `by ${tab.label}`,
    filter ? `filtered to ${filter.prefix} ${filter.label}` : null,
  ]
    .filter(Boolean)
    .join(", ");

  const openInExplorer = () =>
    dispatch(
      addUndo({
        icon: "external",
        message: `Would open the Metric Explorer with ${carried}.`,
      }),
    );

  return (
    <Box className={S.panel}>
      <Group className={S.panelSection} px="xl" py="md" wrap="nowrap">
        <FixedSizeIcon
          name={node.kind === "metric" ? "metric" : "ruler"}
          c="core-brand"
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

      <Stack px="xl" py="lg" gap="lg" flex={1} style={{ overflow: "auto" }}>
        <Stack gap="xs">
          <Group gap="sm" align="baseline">
            <Text fz={24} fw={700} lh={1.1}>
              {formatValue(node, view.current)}
            </Text>
            <Delta delta={view.delta} />
            <Text fz="sm" c="text-secondary">
              vs {comparison}
            </Text>
          </Group>
          <Text fz="sm">{view.verdict}</Text>
        </Stack>

        <Box>
          <TrendChart
            values={seriesOf(node, view.scale)}
            annotation={node.annotation}
          />
          {node.annotation.label && (
            <Text fz="xs" c="text-secondary" mt="xs">
              {node.annotation.label}
            </Text>
          )}
        </Box>

        <Stack gap="sm">
          <Text fw={700}>Break out by</Text>
          <SegmentedControl
            fullWidth
            value={tab.id}
            onChange={setTabId}
            data={node.breakouts.map((breakout) => ({
              value: breakout.id,
              label: breakout.label,
            }))}
          />
          <Text fz="xs" c="text-secondary">
            Ranked by contribution to the change. Click a value to focus the
            tree on it.
          </Text>
          <Stack gap={2}>
            {rows.map((row) => {
              const active =
                filter?.tabId === tab.id && filter.label === row.label;
              const width = `${(Math.abs(row.impact) / maxImpact) * 50}%`;
              return (
                <UnstyledButton
                  key={row.label}
                  className={cx(S.breakoutRow, { [S.active]: active })}
                  px="sm"
                  py="xs"
                  onClick={() =>
                    onFilter(
                      active
                        ? null
                        : {
                            tabId: tab.id,
                            prefix: tab.filterPrefix,
                            label: row.label,
                          },
                    )
                  }
                >
                  <Group gap="md" wrap="nowrap">
                    <Text fz="sm" w={130} className={S.truncate}>
                      {row.label}
                    </Text>
                    <Box className={S.barTrack}>
                      <Box className={S.barAxis} />
                      <Box
                        className={S.bar}
                        bg={
                          row.impact >= 0
                            ? "feedback-positive"
                            : "feedback-negative"
                        }
                        style={
                          row.impact >= 0
                            ? { left: "50%", width }
                            : { right: "50%", width }
                        }
                      />
                    </Box>
                    <Text
                      fz="sm"
                      fw={700}
                      w={56}
                      ta="right"
                      c={
                        row.delta >= 0
                          ? "feedback-positive"
                          : "feedback-negative"
                      }
                    >
                      {formatPct(row.delta, 0)}
                    </Text>
                  </Group>
                </UnstyledButton>
              );
            })}
          </Stack>
        </Stack>
      </Stack>

      <Stack className={S.panelFooter} px="xl" py="md" gap="xs">
        <Button
          variant="default"
          leftSection={<FixedSizeIcon name="external" />}
          onClick={openInExplorer}
        >
          Open in Metric Explorer
        </Button>
      </Stack>
    </Box>
  );
}
