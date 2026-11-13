import { type ReactNode, useMemo } from "react";
import { t } from "ttag";

import { useGetAdhocQueryQuery } from "metabase/api";
import * as Lib from "metabase-lib";

import { getFilterLabel } from "../../harness/clauses";
import { useLabelMeasurer } from "../railroad/RailroadDiagram";
import S from "../railroad/RailroadDiagram.module.css";
import type {
  AndNode,
  NodePath,
  OrNode,
  RailNode,
  Stage,
} from "../railroad/railroad";
import { stageTree, writeRailTree } from "../railroad/railroad";

const PILL_HEIGHT = 28;
const PILL_PADDING_X = 12;
const COUNT_ROW_HEIGHT = 18;
const SERIES_GAP = 14;
const COLUMN_GAP = 16;
const SPLIT_HEIGHT = 22;
const MERGE_HEIGHT = 30;
const LEAD_TRACK = 14;
const CORNER_RADIUS = 6;

/** `axis` is the x of the track running through the box. */
type Box = { width: number; height: number; axis: number };

type Ctx = {
  query: Lib.Query;
  stageIndex: number;
  root: AndNode;
  labelOf: (node: RailNode) => string;
  measureText: (label: string) => number;
  boxes: Map<RailNode, Box>;
  out: ReactNode[];
};

type VerticalRailroadProps = {
  query: Lib.Query;
  stageIndex: number;
  root: AndNode;
};

/**
 * Read-only railroad for explaining a filter: tracks run top to bottom, OR
 * branches split into side-by-side columns and merge below, with row counts
 * on every pill and merge point.
 */
export function VerticalRailroad({
  query,
  stageIndex,
  root,
}: VerticalRailroadProps) {
  const measureText = useLabelMeasurer();
  if (root.children.length === 0) {
    return null;
  }
  const ctx: Ctx = {
    query,
    stageIndex,
    root,
    labelOf: (node) =>
      node.type === "cond"
        ? getFilterLabel(query, stageIndex, node.clause)
        : "",
    measureText,
    boxes: new Map(),
    out: [],
  };
  const box = measure(ctx, root);
  const height = box.height + LEAD_TRACK * 2;
  track(ctx, `M ${box.axis} 0 V ${LEAD_TRACK}`);
  draw(ctx, root, [], 0, LEAD_TRACK);
  track(ctx, `M ${box.axis} ${height - LEAD_TRACK} V ${height}`);

  return (
    <svg
      className={S.svg}
      width={box.width}
      height={height}
      viewBox={`0 0 ${box.width} ${height}`}
    >
      {ctx.out}
    </svg>
  );
}

function measure(ctx: Ctx, node: RailNode): Box {
  const box = measureNode(ctx, node);
  ctx.boxes.set(node, box);
  return box;
}

function measureNode(ctx: Ctx, node: RailNode): Box {
  switch (node.type) {
    case "cond": {
      const width = ctx.measureText(ctx.labelOf(node)) + PILL_PADDING_X * 2;
      return {
        width,
        height: PILL_HEIGHT + COUNT_ROW_HEIGHT,
        axis: width / 2,
      };
    }
    case "and": {
      const boxes = node.children.map((child) => measure(ctx, child));
      const left = Math.max(0, ...boxes.map((box) => box.axis));
      const right = Math.max(0, ...boxes.map((box) => box.width - box.axis));
      return {
        width: left + right,
        height:
          boxes.reduce((sum, box) => sum + box.height, 0) +
          SERIES_GAP * Math.max(0, boxes.length - 1),
        axis: left,
      };
    }
    case "or": {
      const boxes = node.branches.map((branch) => measure(ctx, branch));
      return {
        width:
          boxes.reduce((sum, box) => sum + box.width, 0) +
          COLUMN_GAP * (boxes.length - 1),
        height:
          SPLIT_HEIGHT +
          Math.max(0, ...boxes.map((box) => box.height)) +
          MERGE_HEIGHT,
        axis: boxes[0]?.axis ?? 0,
      };
    }
  }
}

function boxOf(ctx: Ctx, node: RailNode): Box {
  const box = ctx.boxes.get(node);
  if (!box) {
    throw new Error("layout: node was not measured");
  }
  return box;
}

function track(ctx: Ctx, d: string) {
  ctx.out.push(<path key={ctx.out.length} className={S.track} d={d} />);
}

function count(
  ctx: Ctx,
  stage: Stage,
  x: number,
  y: number,
  anchor: "start" | "end",
) {
  ctx.out.push(
    <RowCount
      key={ctx.out.length}
      stage={stage}
      x={x}
      y={y}
      anchor={anchor}
      query={ctx.query}
      stageIndex={ctx.stageIndex}
      root={ctx.root}
    />,
  );
}

function draw(ctx: Ctx, node: RailNode, path: NodePath, x: number, y: number) {
  switch (node.type) {
    case "cond":
      drawPill(ctx, node, path, x, y);
      return;
    case "and":
      drawAnd(ctx, node, path, x, y);
      return;
    case "or":
      drawOr(ctx, node, path, x, y);
      return;
  }
}

function drawPill(
  ctx: Ctx,
  node: RailNode,
  path: NodePath,
  x: number,
  y: number,
) {
  const { width } = boxOf(ctx, node);
  ctx.out.push(
    <g key={ctx.out.length} transform={`translate(${x},${y})`}>
      <rect
        className={S.pillBody}
        width={width}
        height={PILL_HEIGHT}
        rx={PILL_HEIGHT / 2}
      />
      <text
        className={S.pillLabel}
        style={{ cursor: "default" }}
        x={PILL_PADDING_X}
        y={PILL_HEIGHT / 2}
        dominantBaseline="central"
      >
        {ctx.labelOf(node)}
      </text>
    </g>,
  );
  count(
    ctx,
    { kind: "pill", path },
    x + 2,
    y + PILL_HEIGHT + COUNT_ROW_HEIGHT / 2,
    "start",
  );
}

function drawAnd(
  ctx: Ctx,
  node: AndNode,
  path: NodePath,
  x: number,
  y: number,
) {
  const axisX = x + boxOf(ctx, node).axis;
  let cursor = y;
  node.children.forEach((child, index) => {
    const box = boxOf(ctx, child);
    if (index > 0) {
      track(ctx, `M ${axisX} ${cursor} V ${cursor + SERIES_GAP}`);
      cursor += SERIES_GAP;
    }
    draw(ctx, child, [...path, index], axisX - box.axis, cursor);
    cursor += box.height;
  });
}

function drawOr(ctx: Ctx, node: OrNode, path: NodePath, x: number, y: number) {
  const { height } = boxOf(ctx, node);
  const r = CORNER_RADIUS;
  const top = y + SPLIT_HEIGHT;
  const bottom = y + height - MERGE_HEIGHT;
  const splitY = y + SPLIT_HEIGHT / 2;
  const mergeY = bottom + MERGE_HEIGHT / 2;

  let columnX = x;
  const columns = node.branches.map((branch) => {
    const box = boxOf(ctx, branch);
    const column = { branch, box, x: columnX, axis: columnX + box.axis };
    columnX += box.width + COLUMN_GAP;
    return column;
  });
  const mainAxis = columns[0]?.axis ?? x;

  track(ctx, `M ${mainAxis} ${y} V ${top}`);
  track(ctx, `M ${mainAxis} ${bottom} V ${y + height}`);
  columns.forEach(({ branch, box, x: branchX, axis }, index) => {
    if (index > 0) {
      track(
        ctx,
        `M ${mainAxis} ${splitY} H ${axis - r} Q ${axis} ${splitY} ${axis} ${splitY + r} V ${top}`,
      );
      track(
        ctx,
        `M ${axis} ${top + box.height} V ${mergeY - r} Q ${axis} ${mergeY} ${axis - r} ${mergeY} H ${mainAxis}`,
      );
    } else {
      track(ctx, `M ${axis} ${top + box.height} V ${bottom}`);
    }
    draw(ctx, branch, [...path, index], branchX, top);
  });

  const secondAxis = columns[1]?.axis ?? mainAxis;
  ctx.out.push(
    <text
      key={ctx.out.length}
      className={S.orLabel}
      x={(mainAxis + secondAxis) / 2}
      y={splitY}
      textAnchor="middle"
      dominantBaseline="central"
    >
      {t`or`}
    </text>,
  );
  count(ctx, { kind: "merge", orPath: path }, mainAxis - 6, mergeY + 8, "end");
}

type RowCountProps = {
  query: Lib.Query;
  stageIndex: number;
  root: AndNode;
  stage: Stage;
  x: number;
  y: number;
  anchor: "start" | "end";
};

/**
 * Rows that reach this point. The question is summarized, so the count drops
 * its aggregations and breakouts and counts the raw rows instead.
 */
function RowCount({
  query,
  stageIndex,
  root,
  stage,
  x,
  y,
  anchor,
}: RowCountProps) {
  const countJsQuery = useMemo(() => {
    const filtered = writeRailTree(query, stageIndex, stageTree(root, stage));
    const raw = [
      ...Lib.breakouts(filtered, stageIndex),
      ...Lib.aggregations(filtered, stageIndex),
    ].reduce(
      (nextQuery, clause) => Lib.removeClause(nextQuery, stageIndex, clause),
      filtered,
    );
    return Lib.toJsQuery(Lib.aggregateByCount(raw, stageIndex));
  }, [query, stageIndex, root, stage]);
  const result = useGetAdhocQueryQuery({ ...countJsQuery, ignore_error: true });
  const rowCount = result.data?.data?.rows?.[0]?.[0];
  const label =
    result.isFetching || typeof rowCount !== "number"
      ? "…"
      : t`${rowCount.toLocaleString()} rows`;

  return (
    <text
      className={S.count}
      style={{
        paintOrder: "stroke",
        stroke: "var(--mb-color-background_surface-primary)",
        strokeWidth: 4,
      }}
      x={x}
      y={y}
      textAnchor={anchor}
      dominantBaseline="central"
    >
      {label}
    </text>
  );
}
