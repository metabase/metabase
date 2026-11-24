import cx from "classnames";
import { useState } from "react";

import {
  Badge,
  Box,
  Button,
  Group,
  Stack,
  Text,
  UnstyledButton,
} from "metabase/ui";

import S from "../LoFi.module.css";
import { LineChart } from "../Sparkline";
import { formatNumber, getMeasure } from "../data";

type Operator = "+" | "−" | "×" | "÷";

type MetricDef = {
  kind: "metric";
  id: string;
  name: string;
  operator: Operator;
  /** Ids of metrics or measures (prefixed `measure:`). */
  inputs: string[];
};

const METRICS: Record<string, MetricDef> = {
  margin: {
    kind: "metric",
    id: "margin",
    name: "Gross margin %",
    operator: "÷",
    inputs: ["profit", "measure:revenue"],
  },
  profit: {
    kind: "metric",
    id: "profit",
    name: "Gross profit",
    operator: "−",
    inputs: ["net", "measure:cogs"],
  },
  net: {
    kind: "metric",
    id: "net",
    name: "Net revenue",
    operator: "−",
    inputs: ["measure:revenue", "measure:discount"],
  },
  aov: {
    kind: "metric",
    id: "aov",
    name: "Avg order value",
    operator: "÷",
    inputs: ["net", "measure:orders"],
  },
  rph: {
    kind: "metric",
    id: "rph",
    name: "Revenue per billable hour",
    operator: "÷",
    inputs: ["net", "measure:hours"],
  },
};

const ROOTS = ["margin", "aov", "rph"];

const apply = (a: number, op: Operator, b: number) =>
  op === "+" ? a + b : op === "−" ? a - b : op === "×" ? a * b : a / b;

function seriesOf(id: string): number[] {
  if (id.startsWith("measure:")) {
    return getMeasure(id.slice(8)).series;
  }
  const metric = METRICS[id];
  const inputs = metric.inputs.map(seriesOf);
  return inputs[0].map((first, i) =>
    inputs
      .slice(1)
      .reduce((acc, s) => apply(acc, metric.operator, s[i]), first),
  );
}

type NodeInfo = {
  name: string;
  kind: "measure" | "metric";
  detail: string;
};

function describe(id: string): NodeInfo {
  if (id.startsWith("measure:")) {
    const measure = getMeasure(id.slice(8));
    return {
      name: measure.name,
      kind: "measure" as const,
      detail: `${measure.table} · ${measure.aggregation}`,
    };
  }
  const metric = METRICS[id];
  return {
    name: metric.name,
    kind: "metric" as const,
    detail: metric.inputs
      .map((input) => describe(input).name)
      .join(` ${metric.operator} `),
  };
}

const formatValue = (id: string, value: number) =>
  id === "margin" ? `${(value * 100).toFixed(1)}%` : formatNumber(value);

/* ---------- layout: leaves get slots, parents center over children ---------- */

const NODE_W = 210;
const NODE_H = 104;
const GAP_X = 28;
const GAP_Y = 64;

type Placed = {
  id: string;
  path: string;
  x: number;
  y: number;
  parent?: Placed;
  operator?: Operator;
};

function layout(rootId: string): Placed[] {
  const placed: Placed[] = [];
  let slot = 0;
  const visit = (
    id: string,
    path: string,
    depth: number,
    parent?: Placed,
  ): Placed => {
    const node: Placed = {
      id,
      path,
      x: 0,
      y: depth * (NODE_H + GAP_Y),
      parent,
    };
    placed.push(node);
    const metric = METRICS[id];
    if (!metric) {
      node.x = slot++ * (NODE_W + GAP_X);
    } else {
      const children = metric.inputs.map((input, i) =>
        visit(input, `${path}/${i}`, depth + 1, node),
      );
      children.forEach((child) => (child.operator = metric.operator));
      node.x = (children[0].x + children[children.length - 1].x) / 2;
    }
    return node;
  };
  visit(rootId, "root", 0);
  return placed;
}

/**
 * Idea 4: a metric tree. How a metric is composed of other metrics and
 * measures, with current values, so you can verify a number and navigate to
 * what drives it. Visual language borrowed from the dependency graph.
 */
export function MetricTreePrototype() {
  const [rootId, setRootId] = useState(ROOTS[0]);
  const [selectedPath, setSelectedPath] = useState("root");
  const nodes = layout(rootId);
  const selected = nodes.find((node) => node.path === selectedPath) ?? nodes[0];
  const width = Math.max(...nodes.map((n) => n.x)) + NODE_W;
  const height = Math.max(...nodes.map((n) => n.y)) + NODE_H;

  const reroot = (id: string) => {
    setRootId(id);
    setSelectedPath("root");
  };

  return (
    <Stack className={S.lofi} gap="md">
      <Group gap="xs">
        <Text size="sm" c="text-secondary">
          Tree for
        </Text>
        {ROOTS.map((id) => (
          <UnstyledButton
            key={id}
            className={cx(S.chip, { [S.chipActive]: id === rootId })}
            onClick={() => reroot(id)}
          >
            {METRICS[id].name}
          </UnstyledButton>
        ))}
        {!ROOTS.includes(rootId) && (
          <UnstyledButton className={cx(S.chip, S.chipActive)}>
            {METRICS[rootId].name}
          </UnstyledButton>
        )}
      </Group>

      <Group align="flex-start" wrap="nowrap" gap="md">
        <Box
          className={S.box}
          p="lg"
          flex={1}
          style={{
            overflow: "auto",
            backgroundImage:
              "radial-gradient(var(--mb-color-border-neutral) 1px, transparent 1px)",
            backgroundSize: "16px 16px",
          }}
        >
          <Box pos="relative" w={width} h={height} mx="auto">
            <svg
              width={width}
              height={height}
              style={{ position: "absolute", inset: 0, overflow: "visible" }}
            >
              {nodes
                .filter((node) => node.parent)
                .map((node) => {
                  const parent = node.parent!;
                  const x1 = parent.x + NODE_W / 2;
                  const y1 = parent.y + NODE_H;
                  const x2 = node.x + NODE_W / 2;
                  const y2 = node.y;
                  const midY = (y1 + y2) / 2;
                  return (
                    <path
                      key={node.path}
                      d={`M${x1},${y1} C${x1},${midY} ${x2},${midY} ${x2},${y2}`}
                      fill="none"
                      stroke="var(--mb-color-border-neutral)"
                      strokeWidth={1.5}
                    />
                  );
                })}
            </svg>
            {nodes
              .filter((node) => METRICS[node.id])
              .map((node) => (
                <Box
                  key={`op-${node.path}`}
                  pos="absolute"
                  left={node.x + NODE_W / 2 - 12}
                  top={node.y + NODE_H + GAP_Y / 2 - 12}
                  w={24}
                  h={24}
                  className={S.box}
                  style={{
                    display: "grid",
                    placeItems: "center",
                    borderRadius: 12,
                    fontWeight: 700,
                  }}
                >
                  {METRICS[node.id].operator}
                </Box>
              ))}
            {nodes.map((node) => (
              <TreeNode
                key={node.path}
                node={node}
                isSelected={node.path === selected.path}
                onClick={() => setSelectedPath(node.path)}
              />
            ))}
          </Box>
        </Box>

        <DetailPanel id={selected.id} onOpen={reroot} />
      </Group>
    </Stack>
  );
}

function TreeNode({
  node,
  isSelected,
  onClick,
}: {
  node: Placed;
  isSelected: boolean;
  onClick: () => void;
}) {
  const info = describe(node.id);
  const series = seriesOf(node.id);
  const current = series.at(-1) ?? 0;
  const previous = series.at(-2) ?? current;
  const change = previous === 0 ? 0 : (current - previous) / Math.abs(previous);

  return (
    <UnstyledButton
      onClick={onClick}
      pos="absolute"
      left={node.x}
      top={node.y}
      w={NODE_W}
      h={NODE_H}
      p="sm"
      className={S.box}
      style={{
        borderColor: isSelected ? "var(--mb-color-brand)" : undefined,
        borderWidth: isSelected ? 2 : 1,
        borderStyle: info.kind === "measure" ? "dashed" : "solid",
      }}
    >
      <Group justify="space-between" gap={4} wrap="nowrap">
        <Text size="xs" c="text-secondary">
          {info.kind === "metric" ? "▲ METRIC" : "◆ MEASURE"}
        </Text>
        <Text size="xs" c={change >= 0 ? "success" : "error"}>
          {change >= 0 ? "+" : ""}
          {(change * 100).toFixed(1)}%
        </Text>
      </Group>
      <Text size="sm" fw={700} truncate>
        {info.name}
      </Text>
      <Group justify="space-between" align="flex-end" wrap="nowrap" gap="xs">
        <Text fw={700} size="lg">
          {formatValue(node.id, current)}
        </Text>
        <Box w={80}>
          <LineChart values={series} width={80} height={28} showAxes={false} />
        </Box>
      </Group>
    </UnstyledButton>
  );
}

function DetailPanel({
  id,
  onOpen,
}: {
  id: string;
  onOpen: (id: string) => void;
}) {
  const info = describe(id);
  const series = seriesOf(id);
  const usedIn = Object.values(METRICS).filter((metric) =>
    metric.inputs.includes(id),
  );

  return (
    <Stack className={S.box} p="md" w={300} gap="sm" style={{ flexShrink: 0 }}>
      <Badge variant="outline" w="fit-content">
        {info.kind}
      </Badge>
      <Text fw={700} size="lg">
        {info.name}
      </Text>
      <Text size="sm" c="text-secondary">
        {info.kind === "metric" ? `= ${info.detail}` : info.detail}
      </Text>
      <Text fw={700} size="xl">
        {formatValue(id, series.at(-1) ?? 0)}
      </Text>
      <LineChart values={series} width={280} height={120} />
      <Text size="xs" c="text-secondary" mt="xs">
        USED IN
      </Text>
      <Group gap={4}>
        {usedIn.length === 0 ? (
          <Text size="sm" c="text-secondary">
            Nothing yet
          </Text>
        ) : (
          usedIn.map((metric) => (
            <UnstyledButton
              key={metric.id}
              className={S.chip}
              onClick={() => onOpen(metric.id)}
            >
              {metric.name}
            </UnstyledButton>
          ))
        )}
      </Group>
      {info.kind === "metric" ? (
        <Group gap="xs" mt="sm">
          <Button size="xs" variant="filled" onClick={() => onOpen(id)}>
            Show its tree
          </Button>
          <Button size="xs" variant="default">
            Open metric
          </Button>
        </Group>
      ) : (
        <Button size="xs" variant="default" mt="sm" w="fit-content">
          Open measure
        </Button>
      )}
    </Stack>
  );
}
