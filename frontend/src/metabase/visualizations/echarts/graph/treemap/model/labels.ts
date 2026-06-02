import type { EChartsType } from "echarts/core";

import type { FontStyle, TextWidthMeasurer } from "metabase/utils/measure-text";

export interface TreemapLabelFitInput {
  /** The tile's rendered rectangle, in pixels. */
  rect: { width: number; height: number };
  /** Pre-measured width of the (single-line) label text, in pixels. */
  textWidth: number;
  /** Label font size, in pixels. */
  fontSize: number;
  /** Inset from the tile edge on every side (matches `label.position`). */
  padding: number;
}

/**
 * Decide whether a treemap tile's label fits inside the rendered tile.
 *
 * The area-share heuristic in `option.ts` is only a proxy for box size: a tile
 * can hold a large share of the area yet render as a tall, thin sliver with no
 * horizontal room for a label. This measures the actual rendered rectangle
 * against the measured text width (and a single line's height) so slivers hide
 * their labels instead of letting ECharts clip them mid-glyph.
 */
export function shouldShowTreemapLabel({
  rect,
  textWidth,
  fontSize,
  padding,
}: TreemapLabelFitInput): boolean {
  const availableWidth = rect.width - padding * 2;
  const fitsHorizontally = availableWidth > 0 && textWidth <= availableWidth;
  const fitsVertically = rect.height >= padding + fontSize;
  return fitsHorizontally && fitsVertically;
}

/** A treemap tile after ECharts has laid it out. */
export interface TreemapLayoutNode {
  /** Path-encoded node id, matching the ids set in `option.ts` ("0", "0-1"). */
  id: string;
  /** Rendered label text (the node's display name). */
  name: string;
  /** The tile's rendered rectangle, in pixels. */
  rect: { width: number; height: number };
  /**
   * Leaves render their own `label`; group nodes render an `upperLabel` header
   * chip instead, so only leaf labels are subject to width-based hiding.
   */
  isLeaf: boolean;
}

export interface TreemapLabelVisibilityConfig {
  measureText: TextWidthMeasurer;
  fontStyle: FontStyle;
  fontSize: number;
  /** Inset from the tile edge on every side (matches `label.position`). */
  padding: number;
}

/**
 * Decide, per leaf tile, whether its label fits the rendered rectangle. Returns
 * a map keyed by node id (only leaves get an entry); the option builder uses it
 * to override the cheap area-share heuristic with a true width-based decision.
 */
export function getTreemapLabelVisibility(
  nodes: TreemapLayoutNode[],
  { measureText, fontStyle, fontSize, padding }: TreemapLabelVisibilityConfig,
): Record<string, boolean> {
  const visibility: Record<string, boolean> = {};
  for (const node of nodes) {
    if (!node.isLeaf) {
      continue;
    }
    const textWidth = measureText(node.name, fontStyle);
    visibility[node.id] = shouldShowTreemapLabel({
      rect: node.rect,
      textWidth,
      fontSize,
      padding,
    });
  }
  return visibility;
}

// Minimal shape of ECharts' internal treemap tree node. ECharts' public types
// don't surface the laid-out tree, so we narrow to the fields we read.
interface EChartsTreeNode {
  getId(): string;
  name: string;
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
export function getTreemapLayoutNodes(
  chart: EChartsType,
): TreemapLayoutNode[] {
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
      name: node.name,
      rect: { width: layout.width, height: layout.height },
      isLeaf: node.children == null || node.children.length === 0,
    });
  });
  return nodes;
}
