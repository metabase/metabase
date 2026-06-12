import type { VisualizationGridSize } from "custom-viz";

import type { VisualizationProps } from "metabase/visualizations/types";

import type { TreemapLayoutNode } from "./types";

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

/**
 * Tiles at least this tall (and wide enough for the value string on one line)
 * render the full stacked block — name + value + percentage — inline instead of
 * relying on the hover tooltip. Below this they fall back to the name-only label
 * (down to `MIN_LABEL_TILE_HEIGHT`). Sized to fit the three lines plus their
 * inter-line gaps and top/bottom insets (see the rich styles in `style.ts`).
 */
export const MIN_FULL_LABEL_TILE_HEIGHT = 100;

/**
 * How much of a tile's data to render inline:
 * - `"full"` — stacked name + value + percentage (tile is tall enough for the
 *   block and wide enough for the value string on one line);
 * - `"labelOnly"` — just the name (fits the name thresholds but not the block);
 * - `"none"` — nothing (too small to draw a label legibly).
 */
export type TreemapLabelDetail = "full" | "labelOnly" | "none";

export interface TreemapLabelLayout {
  /**
   * Whether to render the tile's label at all. Kept as a convenience derived
   * from `detail` (`detail !== "none"`).
   */
  show: boolean;
  /** How much of the tile's data to render inline (see `TreemapLabelDetail`). */
  detail: TreemapLabelDetail;
  /**
   * Wrapping width (px) for the label text — the tile's rendered width minus the
   * edge inset. With `label.overflow: "break"` the label wraps to this width
   * instead of overflowing/clipping.
   */
  width: number;
}

export interface TreemapLabelLayoutConfig {
  /** Minimum rendered tile width (px) to show a label at all. */
  minTileWidth: number;
  /** Minimum rendered tile height (px) to show a label at all. */
  minTileHeight: number;
  /**
   * Minimum rendered tile height (px) to show the full stacked block (name +
   * value + percentage) rather than the name alone.
   */
  minFullTileHeight: number;
  /** Inset from the tile edge on every side (matches `label.position`). */
  padding: number;
}

/**
 * Resolve a single tile's label layout from its rendered rectangle and the
 * measured width of its formatted value string:
 * - `"full"` when the tile clears `minTileWidth`/`minTileHeight`, is at least
 *   `minFullTileHeight` tall, and the value string fits the inset width on one
 *   line (so the value never wraps);
 * - `"labelOnly"` when it clears the name thresholds but not the block;
 * - `"none"` otherwise.
 * `width` is the inset tile width the label text wraps to.
 */
export function getTreemapLabelLayout(
  rect: { width: number; height: number },
  valueLabelWidth: number,
  {
    minTileWidth,
    minTileHeight,
    minFullTileHeight,
    padding,
  }: TreemapLabelLayoutConfig,
): TreemapLabelLayout {
  const innerWidth = Math.max(0, rect.width - padding * 2);
  const fitsLabel = rect.width >= minTileWidth && rect.height >= minTileHeight;
  const fitsFull =
    fitsLabel &&
    rect.height >= minFullTileHeight &&
    innerWidth >= valueLabelWidth;
  const detail: TreemapLabelDetail = fitsFull
    ? "full"
    : fitsLabel
      ? "labelOnly"
      : "none";
  return { show: detail !== "none", detail, width: innerWidth };
}

export interface TreemapLabelLayoutsConfig extends TreemapLabelLayoutConfig {
  /**
   * Rendered width (px) of a leaf's formatted value string, measured at the
   * value font (see `style.ts`). Used to decide whether the value fits on one
   * line — i.e. whether the tile qualifies for the `"full"` block. Defaults to
   * `Infinity` (no inline value yet), which keeps every tile at `"labelOnly"`.
   */
  getValueLabelWidth?: (id: string) => number;
}

/**
 * Per-leaf label layout (detail level + wrap width), keyed by node id. Tiles
 * missing from the map (the first paint, before any layout exists to measure)
 * stay hidden until a measurement pass covers them.
 */
export function getTreemapLabelLayouts(
  nodes: TreemapLayoutNode[],
  { getValueLabelWidth = () => Infinity, ...config }: TreemapLabelLayoutsConfig,
): Record<string, TreemapLabelLayout> {
  const layouts: Record<string, TreemapLabelLayout> = {};
  for (const node of nodes) {
    if (!node.isLeaf) {
      continue;
    }
    layouts[node.id] = getTreemapLabelLayout(
      node.rect,
      getValueLabelWidth(node.id),
      config,
    );
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

/**
 * Gap (px) reserved between the header's left-aligned name column and its
 * right-aligned value+percentage cluster, so the two never butt together.
 */
export const HEADER_VALUE_PERCENT_GAP = 8;

export interface TreemapParentLabelLayout {
  /**
   * Whether the header chip renders its name text at all (the chip band always
   * stays). Kept and left to ECharts' ellipsis truncation as long as a readable
   * prefix fits; dropped below that.
   */
  showText: boolean;
  /**
   * Whether the chip also renders the right-aligned value + percentage cluster.
   * Only when the name's readable prefix AND the cluster (plus the gap between
   * them) both fit the chip width.
   */
  showValuePercent: boolean;
  /**
   * Width (px) the left name column should occupy so the value+percentage
   * cluster lands flush with the chip's right edge — the inset chip width minus
   * the cluster and the gap. Present only when `showValuePercent` is true; the
   * option builder sets it as the name rich segment's `width`.
   */
  nameColumnWidth?: number;
}

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
  /**
   * Rendered width (px) of a group's right-aligned value+percentage cluster
   * (value + gap + percent), measured at the header fonts. The chip shows the
   * cluster only when the name's readable prefix plus this both fit. Defaults to
   * `() => Infinity` (no inline value+% yet) → `showValuePercent` stays false.
   */
  getValuePercentWidth?: (id: string) => number;
  /**
   * Gap (px) between the name column and the value+percentage cluster. Defaults
   * to `HEADER_VALUE_PERCENT_GAP`.
   */
  valuePercentGap?: number;
}

/**
 * Per-group header layout, keyed by group node id: whether to render the name
 * text, and whether to also render the right-aligned value+percentage. The chip
 * band itself always stays. The name is kept — and left to ECharts' ellipsis
 * truncation — as long as at least `minVisibleChars` leading characters fit; the
 * value+percentage is added only when the readable prefix, the gap, and the
 * value+percentage cluster all fit the chip width. Leaf nodes are ignored (they
 * render their own `label`, handled by `getTreemapLabelLayouts`).
 */
export function getTreemapParentLabelLayouts(
  nodes: TreemapLayoutNode[],
  {
    measureTextWidth,
    getLabel,
    padding,
    minVisibleChars = MIN_HEADER_VISIBLE_CHARS,
    getValuePercentWidth = () => Infinity,
    valuePercentGap = HEADER_VALUE_PERCENT_GAP,
  }: TreemapParentLabelLayoutConfig,
): Record<string, TreemapParentLabelLayout> {
  const layouts: Record<string, TreemapParentLabelLayout> = {};
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
    const minReadableWidth = measureTextWidth(minReadable);
    const showText = minReadableWidth <= available;
    const clusterWidth = getValuePercentWidth(node.id);
    const showValuePercent =
      showText &&
      minReadableWidth + valuePercentGap + clusterWidth <= available;
    layouts[node.id] = {
      showText,
      showValuePercent,
      // The name column takes the slack so the cluster sits flush right; only
      // meaningful when the cluster renders.
      ...(showValuePercent
        ? { nameColumnWidth: available - valuePercentGap - clusterWidth }
        : {}),
    };
  }
  return layouts;
}

export function shouldShowParentLabels(
  gridSize: VisualizationGridSize | undefined,
  settings: VisualizationProps["settings"],
) {
  const PARENT_LABEL_MIN_GRID_WIDTH = 12;
  const PARENT_LABEL_MIN_GRID_HEIGHT = 8;

  const fitsParentLabels =
    gridSize === undefined ||
    (gridSize.width >= PARENT_LABEL_MIN_GRID_WIDTH &&
      gridSize.height >= PARENT_LABEL_MIN_GRID_HEIGHT);

  return (settings["treemap.show_parent_labels"] ?? true) && fitsParentLabels;
}
