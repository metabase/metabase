import "@xyflow/react/dist/style.css";
import dagre from "@dagrejs/dagre";
import {
  Background,
  Handle,
  type Node,
  type NodeProps,
  Position,
  ReactFlow,
  useReactFlow,
} from "@xyflow/react";
import cx from "classnames";
import { useEffect, useMemo, useState } from "react";

import { PageContainer } from "metabase/common/data-studio/components/PageContainer";
import {
  PaneHeader,
  PanelHeaderTitle,
} from "metabase/common/data-studio/components/PaneHeader";
import { useDispatch } from "metabase/redux";
import { addUndo } from "metabase/redux/undo";
import {
  ActionIcon,
  Box,
  Button,
  Card,
  FixedSizeIcon,
  Group,
  Select,
  Stack,
  Text,
  useColorScheme,
} from "metabase/ui";

import { LineChart } from "../Sparkline";
import P from "../investigation/Investigation.module.css";
import { TrendChart } from "../investigation/TrendChart";

import S from "./MetricTreeHiFi.module.css";
import M from "./MetricsMap.module.css";
import {
  KPIS,
  type KpiEdge,
  KpiEdgeLine,
  NODE_H,
  NODE_W,
  definitionOf,
  formatKpi,
  inputsOf,
  seriesOf,
} from "./MetricsMapPrototype";

const DEFAULT_ROOT = "total-revenue";

const ROOT_OPTIONS = Object.values(KPIS)
  .filter((def) => def.kind === "metric")
  .map((def) => ({ value: def.id, label: def.name }));

/** A card's key is its path from the root, so a shared input can appear under each branch. */
type TreeNodeData = {
  kpiId: string;
  inputCount: number;
  isExpanded: boolean;
  isSelected: boolean;
  onClick: () => void;
};
type TreeNode = Node<TreeNodeData, "kpi">;

const NODE_TYPES = { kpi: TreeCard };
const EDGE_TYPES = { kpi: KpiEdgeLine };

function buildVisibleTree(
  rootId: string,
  expanded: Set<string>,
  selectedPath: string | null,
  onCardClick: (path: string) => void,
): { nodes: TreeNode[]; edges: KpiEdge[] } {
  const visible: { path: string; kpiId: string }[] = [];
  const links: { parent: string; child: string; index: number }[] = [];

  const walk = (path: string, kpiId: string, depth: number) => {
    visible.push({ path, kpiId });
    const showChildren = depth === 0 || expanded.has(path);
    if (!showChildren) {
      return;
    }
    inputsOf(kpiId).forEach((input, index) => {
      const childPath = `${path}/${input}`;
      links.push({ parent: path, child: childPath, index });
      walk(childPath, input, depth + 1);
    });
  };
  walk(rootId, rootId, 0);

  const graph = new dagre.graphlib.Graph();
  graph.setGraph({ rankdir: "TB", nodesep: 48, ranksep: 96 });
  graph.setDefaultEdgeLabel(() => ({}));
  visible.forEach(({ path }) =>
    graph.setNode(path, { width: NODE_W, height: NODE_H }),
  );
  links.forEach(({ parent, child }) => graph.setEdge(parent, child));
  dagre.layout(graph);

  const nodes: TreeNode[] = visible.map(({ path, kpiId }) => {
    const { x, y } = graph.node(path);
    return {
      id: path,
      type: "kpi",
      position: { x: x - NODE_W / 2, y: y - NODE_H / 2 },
      data: {
        kpiId,
        inputCount: inputsOf(kpiId).length,
        isExpanded: path === rootId || expanded.has(path),
        isSelected: path === selectedPath,
        onClick: () => onCardClick(path),
      },
    };
  });

  const edges: KpiEdge[] = links.map(({ parent, child }) => {
    const siblings = links
      .filter((link) => link.parent === parent)
      .sort((a, b) => graph.node(a.child).x - graph.node(b.child).x);
    return {
      id: `${child}->${parent}`,
      source: child,
      target: parent,
      targetHandle: `in-${siblings.findIndex((link) => link.child === child)}`,
      type: "kpi",
      data: { op: null, highlighted: false },
    };
  });

  return { nodes, edges };
}

/**
 * The metrics map, one metric at a time: the picked metric sits on top with
 * what it's built from below it. Click a card to open its inputs.
 */
export function MetricsMapV2Prototype() {
  const [rootId, setRootId] = useState(DEFAULT_ROOT);

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
            <Select
              w="18rem"
              searchable
              data={ROOT_OPTIONS}
              value={rootId}
              onChange={(value) => value && setRootId(value)}
              aria-label="Metric at the top"
            />
          }
        />
        <Card withBorder shadow="none" p={0} h={760}>
          <MetricsTree key={rootId} rootId={rootId} />
        </Card>
      </PageContainer>
    </Box>
  );
}

function MetricsTree({ rootId }: { rootId: string }) {
  const { colorScheme } = useColorScheme();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selectedPath, setSelectedPath] = useState<string | null>(null);

  const { nodes, edges } = useMemo(() => {
    const toggle = (path: string) =>
      setExpanded((current) => {
        const next = new Set(current);
        if (next.has(path)) {
          [...next]
            .filter((other) => other === path || other.startsWith(`${path}/`))
            .forEach((other) => next.delete(other));
        } else {
          next.add(path);
        }
        return next;
      });
    const onCardClick = (path: string) => {
      setSelectedPath(path);
      if (path !== rootId) {
        toggle(path);
      }
    };
    return buildVisibleTree(rootId, expanded, selectedPath, onCardClick);
  }, [rootId, expanded, selectedPath]);
  const selectedId = selectedPath?.split("/").at(-1);

  return (
    <Group gap={0} wrap="nowrap" h="100%" align="stretch">
      <Box className={S.canvas} flex={1} miw={0}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={NODE_TYPES}
          edgeTypes={EDGE_TYPES}
          proOptions={{ hideAttribution: true }}
          colorMode={colorScheme === "dark" ? "dark" : "light"}
          fitView
          fitViewOptions={{ padding: 0.15, maxZoom: 0.9 }}
          minZoom={0.15}
          maxZoom={1.25}
          nodesConnectable={false}
          nodesDraggable={false}
        >
          <Background />
          <FitOnChange nodeCount={nodes.length} />
        </ReactFlow>
      </Box>
      {selectedId && (
        <KpiSidePanel
          key={selectedId}
          kpiId={selectedId}
          onClose={() => setSelectedPath(null)}
        />
      )}
    </Group>
  );
}

function FitOnChange({ nodeCount }: { nodeCount: number }) {
  const { fitView } = useReactFlow();
  useEffect(() => {
    const frame = requestAnimationFrame(() =>
      fitView({ padding: 0.15, maxZoom: 0.9, duration: 400 }),
    );
    return () => cancelAnimationFrame(frame);
  }, [nodeCount, fitView]);
  return null;
}

function TreeCard({ data, id }: NodeProps<TreeNode>) {
  const def = KPIS[data.kpiId];
  const series = seriesOf(data.kpiId);
  const current = series.at(-1) ?? 0;
  const previous = series.at(-2) ?? current;
  const change = previous === 0 ? 0 : (current - previous) / Math.abs(previous);
  const isUp = change >= 0;
  const isRoot = !id.includes("/");
  const canToggle = data.inputCount > 0 && !isRoot;

  return (
    <Stack
      className={cx(S.card, {
        [M.metricCard]: def.kind === "metric",
        [M.measureCard]: def.kind === "measure",
      })}
      w={NODE_W}
      gap={0}
      style={{
        cursor: "pointer",
        outline: data.isSelected
          ? "2px solid var(--mb-color-core-brand)"
          : undefined,
      }}
      onClick={data.onClick}
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
        <Box fz={16} fw={700} c="text-primary" flex={1} className={S.truncate}>
          {def.name}
        </Box>
      </Group>
      <Group className={S.row} px="lg" py="sm" gap="md" wrap="nowrap">
        <Stack gap={0} flex={1} miw={0}>
          <Text fz={22} fw={700} lh={1.2} c="text-primary">
            {formatKpi(data.kpiId, current)}
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
        <Text fz="sm" c="text-secondary" className={S.truncate} flex={1}>
          {definitionOf(data.kpiId)}
        </Text>
        {canToggle && (
          <Group gap={4} wrap="nowrap" c="text-secondary">
            <Text fz="sm" fw={700} c="inherit">
              {data.inputCount}
            </Text>
            <FixedSizeIcon
              name={data.isExpanded ? "chevronup" : "chevrondown"}
              size={12}
            />
          </Group>
        )}
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

/** Details for the selected card, in the same layout as investigation mode's panel. */
function KpiSidePanel({
  kpiId,
  onClose,
}: {
  kpiId: string;
  onClose: () => void;
}) {
  const dispatch = useDispatch();
  const def = KPIS[kpiId];
  const series = seriesOf(kpiId);
  const current = series.at(-1) ?? 0;
  const previous = series.at(-2) ?? current;
  const change = previous === 0 ? 0 : (current - previous) / Math.abs(previous);
  const kindLabel = def.kind === "metric" ? "metric" : "measure";
  const usedIn = Object.values(KPIS).filter((other) =>
    inputsOf(other.id).includes(kpiId),
  );
  const toast = (message: string) =>
    dispatch(addUndo({ icon: "external", message }));

  return (
    <Box className={P.panel}>
      <Group className={P.panelSection} px="xl" py="md" wrap="nowrap">
        <FixedSizeIcon
          name={def.kind === "metric" ? "metric" : "ruler"}
          c={def.kind === "metric" ? "core-brand" : "core-summarize"}
        />
        <Stack gap={0} flex={1} miw={0}>
          <Text fw={700} fz="lg">
            {def.name}
          </Text>
          <Text fz="sm" c="text-secondary">
            {def.kind === "metric" ? "Metric" : "Measure"} · {def.category}
          </Text>
        </Stack>
        <ActionIcon variant="subtle" aria-label="Close" onClick={onClose}>
          <FixedSizeIcon name="close" />
        </ActionIcon>
      </Group>

      <Stack px="xl" py="lg" gap="lg" flex={1} style={{ overflow: "auto" }}>
        <Group gap="sm" align="baseline">
          <Text fz={24} fw={700} lh={1.1}>
            {formatKpi(kpiId, current)}
          </Text>
          <Text
            fz="sm"
            fw={700}
            c={change >= 0 ? "feedback-positive" : "feedback-negative"}
          >
            {change >= 0 ? "+" : "−"}
            {(Math.abs(change) * 100).toFixed(1)}%
          </Text>
          <Text fz="sm" c="text-secondary">
            vs last month
          </Text>
        </Group>
        <TrendChart values={series} annotation={{ kind: "none" }} />
        <Stack gap={4}>
          <Text fw={700}>Definition</Text>
          <Text fz="sm" c="text-secondary">
            {definitionOf(kpiId)}
          </Text>
        </Stack>
        {inputsOf(kpiId).length > 0 && (
          <Stack gap={4}>
            <Text fw={700}>Built from</Text>
            {inputsOf(kpiId).map((id) => (
              <Text key={id} fz="sm">
                {KPIS[id].name}
              </Text>
            ))}
          </Stack>
        )}
        {usedIn.length > 0 && (
          <Stack gap={4}>
            <Text fw={700}>Used in</Text>
            {usedIn.map((other) => (
              <Text key={other.id} fz="sm">
                {other.name}
              </Text>
            ))}
          </Stack>
        )}
      </Stack>

      <Stack className={P.panelFooter} px="xl" py="md" gap="sm">
        <Button
          variant="default"
          onClick={() => toast(`Would open the ${kindLabel} ${def.name}.`)}
        >
          Open {kindLabel}
        </Button>
        <Button
          variant="default"
          leftSection={<FixedSizeIcon name="external" />}
          onClick={() =>
            toast(`Would open ${def.name} in the Metric Explorer.`)
          }
        >
          Open in Metric Explorer
        </Button>
      </Stack>
    </Box>
  );
}
