import type { AndNode, NodePath, OrNode, RailNode, Stage } from "./railroad";

export const PILL_HEIGHT = 30;
const PILL_PADDING_X = 12;
const PILL_ICONS_WIDTH = 52;
const SERIES_GAP = 36;
const RAIL_WIDTH = 28;
const BRANCH_GAP = 26;
const BRANCH_BUTTON_HEIGHT = 28;
const CORNER_RADIUS = 8;
const LEAD_TRACK = 20;
const COUNT_ROW_HEIGHT = 18;
const COUNT_GAP = 10;

export type PillShape = {
  kind: "pill";
  path: NodePath;
  label: string;
  x: number;
  y: number;
  width: number;
};
export type TrackShape = { kind: "track"; d: string };
export type PlusShape = {
  kind: "plus";
  andPath: NodePath;
  index: number;
  x: number;
  y: number;
  isTrailing: boolean;
};
export type OrLabelShape = { kind: "or-label"; x: number; y: number };
export type BranchButtonShape = {
  kind: "branch-button";
  orPath: NodePath;
  x: number;
  y: number;
};
export type CountShape = {
  kind: "count";
  stage: Stage;
  x: number;
  y: number;
  anchor: "middle" | "start";
};
export type Shape =
  | PillShape
  | TrackShape
  | PlusShape
  | OrLabelShape
  | BranchButtonShape
  | CountShape;

export type Layout = { shapes: Shape[]; width: number; height: number };

type Box = { width: number; height: number; baseline: number };

type LayoutContext = {
  measureLabel: (node: RailNode) => number;
  labelOf: (node: RailNode) => string;
  showCounts: boolean;
  boxes: Map<RailNode, Box>;
  shapes: Shape[];
};

/** Counts sit on one row under the pills: this far below the track. */
const countY = (trackY: number) => trackY + PILL_HEIGHT / 2 + COUNT_GAP;

function measure(ctx: LayoutContext, node: RailNode): Box {
  const box = measureNode(ctx, node);
  ctx.boxes.set(node, box);
  return box;
}

function measureNode(ctx: LayoutContext, node: RailNode): Box {
  switch (node.type) {
    case "cond":
      return {
        width: ctx.measureLabel(node) + PILL_PADDING_X + PILL_ICONS_WIDTH,
        height: PILL_HEIGHT + (ctx.showCounts ? COUNT_ROW_HEIGHT : 0),
        baseline: PILL_HEIGHT / 2,
      };
    case "and": {
      const boxes = node.children.map((child) => measure(ctx, child));
      const baseline = Math.max(
        PILL_HEIGHT / 2,
        ...boxes.map((box) => box.baseline),
      );
      const below = Math.max(
        PILL_HEIGHT / 2,
        ...boxes.map((box) => box.height - box.baseline),
      );
      return {
        width:
          boxes.reduce((sum, box) => sum + box.width, 0) +
          SERIES_GAP * (boxes.length + 1),
        height: baseline + below,
        baseline,
      };
    }
    case "or": {
      const boxes = node.branches.map((branch) => measure(ctx, branch));
      const stackHeight =
        boxes.reduce((sum, box) => sum + box.height, 0) +
        BRANCH_GAP * (boxes.length - 1);
      return {
        width: Math.max(...boxes.map((box) => box.width)) + RAIL_WIDTH * 2,
        height: stackHeight + BRANCH_GAP + BRANCH_BUTTON_HEIGHT,
        baseline: boxes[0]?.baseline ?? PILL_HEIGHT / 2,
      };
    }
  }
}

function boxOf(ctx: LayoutContext, node: RailNode): Box {
  const box = ctx.boxes.get(node);
  if (!box) {
    throw new Error("layout: node was not measured");
  }
  return box;
}

const line = (x1: number, y1: number, x2: number, y2: number): TrackShape => ({
  kind: "track",
  d: `M ${x1} ${y1} L ${x2} ${y2}`,
});

function draw(
  ctx: LayoutContext,
  node: RailNode,
  path: NodePath,
  x: number,
  y: number,
) {
  switch (node.type) {
    case "cond": {
      const { width } = boxOf(ctx, node);
      ctx.shapes.push({
        kind: "pill",
        path,
        label: ctx.labelOf(node),
        x,
        y,
        width,
      });
      if (ctx.showCounts) {
        ctx.shapes.push({
          kind: "count",
          stage: { kind: "pill", path },
          x: x + width / 2,
          y: countY(y + PILL_HEIGHT / 2),
          anchor: "middle",
        });
      }
      return;
    }
    case "and":
      drawAnd(ctx, node, path, x, y);
      return;
    case "or":
      drawOr(ctx, node, path, x, y);
      return;
  }
}

function drawAnd(
  ctx: LayoutContext,
  node: AndNode,
  path: NodePath,
  x: number,
  y: number,
) {
  const { baseline } = boxOf(ctx, node);
  const trackY = y + baseline;
  let cursor = x;
  const plusAt = (index: number, isTrailing: boolean) => {
    ctx.shapes.push(line(cursor, trackY, cursor + SERIES_GAP, trackY));
    ctx.shapes.push({
      kind: "plus",
      andPath: path,
      index,
      x: cursor + SERIES_GAP / 2,
      y: trackY,
      isTrailing,
    });
    cursor += SERIES_GAP;
  };
  node.children.forEach((child, index) => {
    const isFirst = index === 0;
    if (isFirst) {
      ctx.shapes.push(line(cursor, trackY, cursor + SERIES_GAP, trackY));
      cursor += SERIES_GAP;
    } else {
      plusAt(index, false);
    }
    const box = boxOf(ctx, child);
    draw(ctx, child, [...path, index], cursor, trackY - box.baseline);
    cursor += box.width;
  });
  plusAt(node.children.length, true);
}

function drawOr(
  ctx: LayoutContext,
  node: OrNode,
  path: NodePath,
  x: number,
  y: number,
) {
  const { width, baseline, height } = boxOf(ctx, node);
  const trackY = y + baseline;
  const leftRailX = x + RAIL_WIDTH / 2;
  const rightRailX = x + width - RAIL_WIDTH / 2;
  const contentX = x + RAIL_WIDTH;
  const contentRight = x + width - RAIL_WIDTH;
  const r = CORNER_RADIUS;

  let branchTop = y;
  const branchTracks = node.branches.map((branch) => {
    const box = boxOf(ctx, branch);
    const branchY = branchTop + box.baseline;
    const top = branchTop;
    branchTop += box.height + BRANCH_GAP;
    return { branch, box, branchY, top };
  });
  const lastBranchY = branchTracks[branchTracks.length - 1]?.branchY ?? trackY;

  ctx.shapes.push(line(x, trackY, contentX, trackY));
  ctx.shapes.push(line(contentRight, trackY, x + width, trackY));
  ctx.shapes.push({
    kind: "track",
    d: `M ${leftRailX - r} ${trackY} Q ${leftRailX} ${trackY} ${leftRailX} ${trackY + r} V ${lastBranchY - r}`,
  });
  ctx.shapes.push({
    kind: "track",
    d: `M ${rightRailX + r} ${trackY} Q ${rightRailX} ${trackY} ${rightRailX} ${trackY + r} V ${lastBranchY - r}`,
  });

  branchTracks.forEach(({ branch, box, branchY, top }, index) => {
    const isMainLine = index === 0;
    if (isMainLine) {
      ctx.shapes.push(line(contentX, branchY, contentX, branchY));
    } else {
      ctx.shapes.push({
        kind: "track",
        d: `M ${leftRailX} ${branchY - r} Q ${leftRailX} ${branchY} ${leftRailX + r} ${branchY} H ${contentX}`,
      });
    }
    ctx.shapes.push(line(contentX + box.width, branchY, contentRight, branchY));
    if (!isMainLine) {
      ctx.shapes.push({
        kind: "track",
        d: `M ${rightRailX} ${branchY - r} Q ${rightRailX} ${branchY} ${rightRailX - r} ${branchY} H ${contentRight}`,
      });
    }
    draw(ctx, branch, [...path, index], contentX, top);
  });

  const secondBranchY = branchTracks[1]?.branchY ?? trackY;
  ctx.shapes.push({
    kind: "or-label",
    x: leftRailX,
    y: (trackY + secondBranchY) / 2,
  });
  ctx.shapes.push({
    kind: "branch-button",
    orPath: path,
    x: contentX + SERIES_GAP,
    y: y + height - BRANCH_BUTTON_HEIGHT,
  });
  if (ctx.showCounts) {
    ctx.shapes.push({
      kind: "count",
      stage: { kind: "merge", orPath: path },
      x: rightRailX + CORNER_RADIUS,
      y: countY(trackY),
      anchor: "start",
    });
  }
}

type LayoutOptions = {
  labelOf: (node: RailNode) => string;
  measureLabel: (node: RailNode) => number;
  showCounts?: boolean;
};

export function layoutRailroad(
  root: AndNode,
  { labelOf, measureLabel, showCounts = false }: LayoutOptions,
): Layout {
  const ctx: LayoutContext = {
    labelOf,
    measureLabel,
    showCounts,
    boxes: new Map(),
    shapes: [],
  };
  const box = measure(ctx, root);
  const trackY = box.baseline;
  ctx.shapes.push(line(0, trackY, LEAD_TRACK, trackY));
  draw(ctx, root, [], LEAD_TRACK, 0);
  const width = LEAD_TRACK + box.width + LEAD_TRACK;
  ctx.shapes.push(line(width - LEAD_TRACK, trackY, width, trackY));
  return { shapes: ctx.shapes, width, height: box.height };
}
