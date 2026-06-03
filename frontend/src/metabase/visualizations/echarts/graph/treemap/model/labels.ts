import type { EChartsType } from "echarts/core";

/**
 * Tiles narrower than this (in rendered px) hide their label entirely. Wrapping
 * a label into a too-narrow column produces a tall stack of 1–2 character lines
 * that reads worse than no label, so below this width we drop it.
 */
export const MIN_LABEL_TILE_WIDTH = 100;

/**
 * Tiles shorter than this (in rendered px) hide their label entirely. A label
 * line can't be drawn legibly in a tile this short — ECharts would only
 * vertically truncate it — so below this height we drop it, matching the
 * width-based rule above.
 */
export const MIN_LABEL_TILE_HEIGHT = 40;

export interface TreemapLabelLayout {
  /** Whether to render the tile's label at all. */
  show: boolean;
  /**
   * Wrapping width (px) for the label text — the tile's rendered width minus the
   * edge inset. With `label.overflow: "break"` the label wraps to this width
   * instead of overflowing/clipping.
   */
  width: number;
}

/** A treemap tile after ECharts has laid it out. */
export interface TreemapLayoutNode {
  /** Path-encoded node id, matching the ids set in `option.ts` ("0", "0-1"). */
  id: string;
  /** The tile's rendered rectangle, in pixels. */
  rect: { width: number; height: number };
  /**
   * Leaves render their own `label`; group nodes render an `upperLabel` header
   * chip instead, so only leaf labels are subject to wrapping/hiding.
   */
  isLeaf: boolean;
}

export interface TreemapLabelLayoutConfig {
  /** Minimum rendered tile width (px) to show a label at all. */
  minTileWidth: number;
  /** Minimum rendered tile height (px) to show a label at all. */
  minTileHeight: number;
  /** Inset from the tile edge on every side (matches `label.position`). */
  padding: number;
}

/**
 * Resolve a single tile's label layout from its rendered rectangle: show the
 * label only when the tile is at least `minTileWidth` wide and `minTileHeight`
 * tall, and wrap its text to the inset tile width.
 */
export function getTreemapLabelLayout(
  rect: { width: number; height: number },
  { minTileWidth, minTileHeight, padding }: TreemapLabelLayoutConfig,
): TreemapLabelLayout {
  return {
    show: rect.width >= minTileWidth && rect.height >= minTileHeight,
    width: Math.max(0, rect.width - padding * 2),
  };
}

/**
 * Per-leaf label layout (show + wrap width), keyed by node id. The option
 * builder applies it on top of its cheap area-share heuristic, which only covers
 * the first paint before any layout exists to measure.
 */
export function getTreemapLabelLayouts(
  nodes: TreemapLayoutNode[],
  config: TreemapLabelLayoutConfig,
): Record<string, TreemapLabelLayout> {
  const layouts: Record<string, TreemapLabelLayout> = {};
  for (const node of nodes) {
    if (!node.isLeaf) {
      continue;
    }
    layouts[node.id] = getTreemapLabelLayout(node.rect, config);
  }
  return layouts;
}

/**
 * Below this many characters a truncated header reads as noise rather than a
 * label, so the chip shows no text at all. A header is kept (and left to ECharts'
 * normal ellipsis truncation) as long as at least this many leading characters
 * of the label fit the chip width.
 */
export const MIN_HEADER_VISIBLE_CHARS = 3;

export interface TreemapParentLabelLayoutConfig {
  /** Rendered width (px) of the header text, measured at the chip's font style. */
  measureTextWidth: (text: string) => number;
  /** Resolves a group node id ("0", "1", …) to its header text. */
  getLabel: (id: string) => string | undefined;
  /** Horizontal inset on each side of the text (matches `upperLabel.padding`). */
  padding: number;
  /**
   * Fewest leading characters of the label that must fit for the text to show.
   * Defaults to `MIN_HEADER_VISIBLE_CHARS`.
   */
  minVisibleChars?: number;
}

/**
 * Per-group decision of whether the header chip should render its text, keyed by
 * group node id. The chip band itself always stays (it's part of the layout).
 * The text is kept — and left to ECharts' normal ellipsis truncation — as long
 * as at least `minVisibleChars` leading characters fit the chip width; below
 * that the chip is too narrow for even a readable truncation, so the text is
 * dropped rather than shown as one or two characters plus an ellipsis. Leaf
 * nodes are ignored (they render their own `label`, handled by
 * `getTreemapLabelLayouts`).
 */
export function getTreemapParentLabelLayouts(
  nodes: TreemapLayoutNode[],
  {
    measureTextWidth,
    getLabel,
    padding,
    minVisibleChars = MIN_HEADER_VISIBLE_CHARS,
  }: TreemapParentLabelLayoutConfig,
): Record<string, boolean> {
  const showText: Record<string, boolean> = {};
  for (const node of nodes) {
    if (node.isLeaf) {
      continue;
    }
    const label = getLabel(node.id);
    if (label == null) {
      continue;
    }
    const available = node.rect.width - padding * 2;
    // Require only a readable prefix to fit, not the whole label — ECharts
    // truncates the rest with an ellipsis.
    const minReadable = label.slice(0, minVisibleChars);
    showText[node.id] = measureTextWidth(minReadable) <= available;
  }
  return showText;
}

/** A treemap tile's rendered rectangle (pixels, relative to the chart canvas). */
export interface TreemapRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Minimal shape of ECharts' internal treemap tree node. ECharts' public types
// don't surface the laid-out tree, so we narrow to the fields we read.
interface EChartsTreeNode {
  getId(): string;
  children?: EChartsTreeNode[];
  getLayout():
    | { x?: number; y?: number; width?: number; height?: number }
    | undefined;
  eachNode(cb: (node: EChartsTreeNode) => void): void;
}

/**
 * The treemap's laid-out tree (with per-node pixel layout) lives on the raw
 * series data (`.tree.root`), which ECharts' public types don't expose — hence
 * the narrow cast. Returns `undefined` before the first layout.
 */
function getTreemapRoot(chart: EChartsType): EChartsTreeNode | undefined {
  return (
    chart as unknown as {
      getModel(): {
        getSeriesByIndex(i: number): {
          getRawData(): { tree?: { root?: EChartsTreeNode } };
        } | null;
      };
    }
  )
    .getModel()
    ?.getSeriesByIndex(0)
    ?.getRawData()?.tree?.root;
}

/**
 * The rendered pixel rectangle of the tile with the given path-encoded id (the
 * ids set in `option.ts`: "0", "0-1"), or `null` if the node isn't laid out yet
 * or has no usable rect. Used to position the hover overlay over a whole
 * section (see `TreemapChart/events.ts`).
 */
export function getTreemapNodeRectById(
  chart: EChartsType,
  id: string,
): TreemapRect | null {
  const root = getTreemapRoot(chart);
  if (!root) {
    return null;
  }

  let rect: TreemapRect | null = null;
  root.eachNode((node) => {
    if (rect != null || node.getId() !== id) {
      return;
    }
    const layout = node.getLayout();
    if (
      layout?.width == null ||
      layout?.height == null ||
      layout.x == null ||
      layout.y == null
    ) {
      return;
    }
    rect = {
      x: layout.x,
      y: layout.y,
      width: layout.width,
      height: layout.height,
    };
  });
  return rect;
}

/**
 * Pull the laid-out treemap tiles off an ECharts instance. Off-screen or
 * zero-area nodes (no usable layout) are skipped.
 */
export function getTreemapLayoutNodes(chart: EChartsType): TreemapLayoutNode[] {
  const root = getTreemapRoot(chart);

  if (!root) {
    return [];
  }

  const nodes: TreemapLayoutNode[] = [];
  root.eachNode((node) => {
    const layout = node.getLayout();
    if (!layout?.width || !layout?.height) {
      return;
    }
    nodes.push({
      id: node.getId(),
      rect: { width: layout.width, height: layout.height },
      isLeaf: node.children == null || node.children.length === 0,
    });
  });
  return nodes;
}
