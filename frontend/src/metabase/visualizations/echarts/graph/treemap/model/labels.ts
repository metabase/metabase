import type { EChartsType } from "echarts/core";

/**
 * Tiles narrower than this (in rendered px) hide their label entirely. Wrapping
 * a label into a too-narrow column produces a tall stack of 1–2 character lines
 * that reads worse than no label, so below this width we drop it.
 */
export const MIN_LABEL_TILE_WIDTH = 100;

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
  /** Inset from the tile edge on every side (matches `label.position`). */
  padding: number;
}

/**
 * Resolve a single tile's label layout from its rendered rectangle: show the
 * label only when the tile is at least `minTileWidth` wide, and wrap its text to
 * the inset tile width.
 */
export function getTreemapLabelLayout(
  rect: { width: number; height: number },
  { minTileWidth, padding }: TreemapLabelLayoutConfig,
): TreemapLabelLayout {
  return {
    show: rect.width >= minTileWidth,
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

// Minimal shape of ECharts' internal treemap tree node. ECharts' public types
// don't surface the laid-out tree, so we narrow to the fields we read.
interface EChartsTreeNode {
  getId(): string;
  children?: EChartsTreeNode[];
  getLayout(): { width?: number; height?: number } | undefined;
  eachNode(cb: (node: EChartsTreeNode) => void): void;
}

/**
 * Pull the laid-out treemap tiles off an ECharts instance. The treemap's tree
 * (with per-node pixel layout) lives on the raw series data (`.tree.root`),
 * which ECharts' public types don't expose — hence the narrow cast. Off-screen
 * or zero-area nodes (no usable layout) are skipped.
 */
export function getTreemapLayoutNodes(chart: EChartsType): TreemapLayoutNode[] {
  const root = (
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
