/**
 * Mock story for investigation mode: Revenue drops 5.2% this month. Almost all
 * of it is Gross sales in the EU, because new customer orders from paid search
 * fell off a cliff. Refunds are flat, Discounts are up but normal for
 * Black Friday month. Numbers are made up.
 */

export type Operator = "+" | "−" | "×";

export type Breakout = {
  label: string;
  /** Share of the node's previous-period value. */
  share: number;
  /** Change vs previous period, as a fraction. */
  delta: number;
};

export type BreakoutTab = {
  id: string;
  label: string;
  /** Filter chip prefix, e.g. "Region is". */
  filterPrefix: string;
  items: Breakout[];
};

export type AnnotationKind = "break" | "seasonal" | "none";

export type InvestigationNode = {
  id: string;
  name: string;
  kind: "metric" | "measure";
  format: "currency" | "count";
  previous: number;
  current: number;
  /** Terms, each with the operator it enters its parent with. */
  children?: { id: string; op: Operator | null }[];
  /** Operator used to combine children, for contribution math. */
  combine?: "sum" | "product";
  verdict: string;
  annotation: { kind: AnnotationKind; label?: string };
  breakouts: BreakoutTab[];
};

export const PERIODS = [
  { value: "month", label: "Month over month" },
  { value: "quarter", label: "Quarter over quarter" },
  { value: "yoy", label: "Year over year" },
];

/** 14 months, ending in the current one. */
export const MONTH_LABELS = [
  "Oct",
  "Nov",
  "Dec",
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
];

const tab = (
  id: string,
  label: string,
  filterPrefix: string,
  items: Breakout[],
): BreakoutTab => ({ id, label, filterPrefix, items });

const uniform = (delta: number): BreakoutTab[] => [
  tab("region", "Region", "Region is", [
    { label: "EU", share: 0.35, delta: delta - 0.004 },
    { label: "US", share: 0.45, delta: delta + 0.003 },
    { label: "APAC", share: 0.12, delta: delta + 0.002 },
    { label: "LatAm", share: 0.08, delta: delta - 0.002 },
  ]),
  tab("plan", "Plan", "Plan is", [
    { label: "Starter", share: 0.25, delta: delta + 0.002 },
    { label: "Pro", share: 0.4, delta: delta - 0.001 },
    { label: "Enterprise", share: 0.35, delta },
  ]),
  tab("channel", "Channel", "Channel is", [
    { label: "Paid search", share: 0.3, delta: delta - 0.003 },
    { label: "Organic", share: 0.4, delta: delta + 0.002 },
    { label: "Partner", share: 0.2, delta },
    { label: "Email", share: 0.1, delta: delta + 0.001 },
  ]),
  tab("segment", "Segments", "Segment is", [
    { label: "New customers", share: 0.3, delta: delta - 0.002 },
    { label: "Returning customers", share: 0.7, delta: delta + 0.001 },
    { label: "Enterprise customers", share: 0.35, delta },
  ]),
];

const eu = (
  euDelta: number,
  usDelta: number,
  plan: [number, number, number],
  channel: [number, number, number, number],
  segments: [number, number, number, number],
): BreakoutTab[] => [
  tab("region", "Region", "Region is", [
    { label: "EU", share: 0.35, delta: euDelta },
    { label: "US", share: 0.45, delta: usDelta },
    { label: "APAC", share: 0.12, delta: -0.01 },
    { label: "LatAm", share: 0.08, delta: 0.005 },
  ]),
  tab("plan", "Plan", "Plan is", [
    { label: "Starter", share: 0.25, delta: plan[0] },
    { label: "Pro", share: 0.4, delta: plan[1] },
    { label: "Enterprise", share: 0.35, delta: plan[2] },
  ]),
  tab("channel", "Channel", "Channel is", [
    { label: "Paid search", share: 0.3, delta: channel[0] },
    { label: "Organic", share: 0.4, delta: channel[1] },
    { label: "Partner", share: 0.2, delta: channel[2] },
    { label: "Email", share: 0.1, delta: channel[3] },
  ]),
  tab("segment", "Segments", "Segment is", [
    { label: "New customers", share: 0.3, delta: segments[0] },
    { label: "Returning customers", share: 0.7, delta: segments[1] },
    { label: "Enterprise customers", share: 0.35, delta: segments[2] },
    { label: "EU small businesses", share: 0.14, delta: segments[3] },
  ]),
];

export const NODES: Record<string, InvestigationNode> = {
  revenue: {
    id: "revenue",
    name: "Revenue",
    kind: "metric",
    format: "currency",
    previous: 1_276_000,
    current: 1_209_600,
    combine: "sum",
    children: [
      { id: "gross", op: null },
      { id: "refunds", op: "−" },
      { id: "discounts", op: "−" },
    ],
    verdict: "Split: EU −15%, US +1%",
    annotation: { kind: "none" },
    breakouts: eu(
      -0.15,
      0.012,
      [-0.12, -0.03, -0.015],
      [-0.13, -0.012, -0.012, -0.002],
      [-0.16, 0.002, -0.015, -0.33],
    ),
  },
  gross: {
    id: "gross",
    name: "Gross sales",
    kind: "metric",
    format: "currency",
    previous: 1_400_000,
    current: 1_340_800,
    combine: "product",
    children: [
      { id: "orders", op: null },
      { id: "aov", op: "×" },
    ],
    verdict: "Split: EU −14%, US +2%",
    annotation: { kind: "none" },
    breakouts: eu(
      -0.14,
      0.015,
      [-0.11, -0.025, -0.013],
      [-0.12, -0.01, -0.01, 0],
      [-0.15, 0.004, -0.013, -0.3],
    ),
  },
  refunds: {
    id: "refunds",
    name: "Refunds",
    kind: "measure",
    format: "currency",
    previous: 70_000,
    current: 70_700,
    verdict: "Uniform: +1% everywhere",
    annotation: { kind: "none" },
    breakouts: uniform(0.01),
  },
  discounts: {
    id: "discounts",
    name: "Discounts",
    kind: "measure",
    format: "currency",
    previous: 54_000,
    current: 60_500,
    verdict: "Seasonal: normal for November",
    annotation: {
      kind: "seasonal",
      label: "Black Friday: +13% last November too",
    },
    breakouts: uniform(0.12),
  },
  orders: {
    id: "orders",
    name: "Orders",
    kind: "measure",
    format: "count",
    previous: 20_000,
    current: 18_992,
    combine: "sum",
    children: [
      { id: "newOrders", op: null },
      { id: "returningOrders", op: "+" },
    ],
    verdict: "Split: EU −15%, US +1%",
    annotation: { kind: "none" },
    breakouts: eu(
      -0.15,
      0.01,
      [-0.12, -0.03, -0.01],
      [-0.13, -0.012, -0.01, -0.002],
      [-0.17, 0.001, -0.01, -0.32],
    ),
  },
  aov: {
    id: "aov",
    name: "Average order value",
    kind: "metric",
    format: "currency",
    previous: 70,
    current: 70.6,
    verdict: "Uniform: +1% everywhere",
    annotation: { kind: "none" },
    breakouts: uniform(0.009),
  },
  newOrders: {
    id: "newOrders",
    name: "New customer orders",
    kind: "measure",
    format: "count",
    previous: 6_000,
    current: 4_980,
    verdict: "Trend broke in November",
    annotation: {
      kind: "break",
      label: "Trend broke in November: EU paid search −52%",
    },
    breakouts: eu(
      -0.42,
      0.02,
      [-0.31, -0.12, -0.04],
      [-0.46, -0.03, -0.02, 0.01],
      [-0.17, 0, -0.04, -0.52],
    ),
  },
  returningOrders: {
    id: "returningOrders",
    name: "Returning customer orders",
    kind: "measure",
    format: "count",
    previous: 14_000,
    current: 14_012,
    verdict: "Uniform: flat everywhere",
    annotation: { kind: "none" },
    breakouts: uniform(0.001),
  },
};

export const ROOT_ID = "revenue";

export const deltaOf = (node: { previous: number; current: number }) =>
  node.previous === 0 ? 0 : (node.current - node.previous) / node.previous;

/** 14 months ending in previous, current; shaped by the node's annotation. */
export function seriesOf(node: InvestigationNode, scale = 1): number[] {
  const n = MONTH_LABELS.length;
  const values = MONTH_LABELS.map((_, i) => {
    const t = i - (n - 2);
    const trend = 1 + t * 0.012;
    const wobble = 0.012 * Math.sin(i * 1.7 + node.name.length);
    const seasonal = node.annotation.kind === "seasonal" && i === 1 ? 0.13 : 0;
    return node.previous * (trend + wobble + seasonal);
  });
  values[n - 2] = node.previous;
  values[n - 1] = node.current;
  return values.map((value) => value * scale);
}

export function formatValue(node: InvestigationNode, value: number): string {
  if (node.format === "count") {
    return Math.round(value).toLocaleString("en-US");
  }
  if (Math.abs(value) >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(2)}M`;
  }
  if (Math.abs(value) >= 1_000) {
    return `$${(value / 1_000).toFixed(1)}k`;
  }
  return `$${value.toFixed(2)}`;
}

export const formatPct = (delta: number, digits = 1) =>
  `${delta >= 0 ? "+" : "−"}${(Math.abs(delta) * 100).toFixed(digits)}%`;

export type Series = { label: string; values: number[] };

export const SERIES_COLORS = [
  "var(--mb-color-accent0)",
  "var(--mb-color-accent1)",
  "var(--mb-color-accent2)",
  "var(--mb-color-accent3)",
  "var(--mb-color-accent4)",
];

/** Each breakout value's monthly series: its share of the total, then its own change. */
export function breakoutSeriesOf(
  node: InvestigationNode,
  tab: BreakoutTab,
  scale = 1,
): Series[] {
  const total = seriesOf(node, scale);
  const n = total.length;
  return tab.items.map((item) => ({
    label: item.label,
    values: total.map((value, i) =>
      i === n - 1
        ? node.previous * scale * item.share * (1 + item.delta)
        : value * item.share,
    ),
  }));
}
