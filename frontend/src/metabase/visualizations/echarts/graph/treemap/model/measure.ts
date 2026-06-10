import { formatPercent } from "metabase/static-viz/lib/numbers";
import type { RenderingContext } from "metabase/visualizations/types";

import {
  LABEL_PADDING,
  TREEMAP_CHART_STYLE,
  groupHeader,
  leafBlock,
} from "../style";

import type { TreemapFormatters } from "./formatters";
import {
  MIN_FULL_LABEL_TILE_HEIGHT,
  MIN_LABEL_TILE_HEIGHT,
  MIN_LABEL_TILE_WIDTH,
  type TreemapLabelLayout,
  type TreemapParentLabelLayout,
  getTreemapLabelLayouts,
  getTreemapParentLabelLayouts,
} from "./labels";
import { getNode } from "./tree";
import type { NodeId, TreemapLayoutNode, TreemapTree } from "./types";

export interface TreemapMeasuredLabelLayouts {
  labelLayout: Record<NodeId, TreemapLabelLayout>;
  parentLabelLayout: Record<NodeId, TreemapParentLabelLayout>;
}

/**
 * Second pass of the label layout: given the rendered tile rectangles, measure
 * each label at its real font and decide which tiles show the full stacked
 * block, the name alone, or nothing — and which group header chips show their
 * name and the right-aligned value+percentage cluster. Shared by the dynamic
 * chart (via `use-label-measurement`, off the `finished` event) and the static
 * renderer (which lays out, measures, and re-renders synchronously).
 */
export function measureTreemapLabelLayouts({
  nodes,
  tree,
  formatters,
  renderingContext,
  showLeafValues,
  showParentValues,
}: {
  nodes: TreemapLayoutNode[];
  tree: TreemapTree;
  formatters: TreemapFormatters;
  renderingContext: RenderingContext;
  showLeafValues: boolean;
  showParentValues: boolean;
}): TreemapMeasuredLabelLayouts {
  const total = tree.reduce((sum, node) => sum + node.value, 0);
  const formatShare = (value: number) =>
    formatPercent(total === 0 ? 0 : value / total);

  // Leaf tiles qualify for the "full" stacked block only when the value line
  // (the widest, at the H3 font) fits the tile width, so measure it at that
  // font. The value renders in the leaf-label font family (see the rich style
  // in `option.ts`), so measure with the same family.
  const labelLayout = getTreemapLabelLayouts(nodes, {
    minTileWidth: MIN_LABEL_TILE_WIDTH,
    minTileHeight: MIN_LABEL_TILE_HEIGHT,
    minFullTileHeight: MIN_FULL_LABEL_TILE_HEIGHT,
    padding: LABEL_PADDING,
    getValueLabelWidth: (id) => {
      // Setting off → never qualify for the "full" block (stay name-only).
      if (!showLeafValues) {
        return Infinity;
      }
      const node = getNode(id, tree);
      if (node == null) {
        return Infinity;
      }
      return renderingContext.measureText(formatters.value(node.value), {
        size: leafBlock.value.fontSize,
        family: TREEMAP_CHART_STYLE.nodeLabels.fontFamily,
        weight: leafBlock.value.fontWeight,
      });
    },
  });

  // Parent (group) header chips: a group node id is "0", "1", … — the index
  // into the top-level tree. Measure each header's name at the chip's font
  // style (too-narrow chips suppress the name); also measure the right-aligned
  // value+percentage cluster (value bold + gap + percent regular) so the chip
  // shows it only when there's room.
  const measureHeader = (text: string, weight: number) =>
    renderingContext.measureText(text, {
      size: groupHeader.fontSize,
      family: renderingContext.fontFamily,
      weight,
    });
  const parentLabelLayout = getTreemapParentLabelLayouts(nodes, {
    getLabel: (id) => getNode(id, tree)?.displayName,
    measureTextWidth: (text) => measureHeader(text, groupHeader.fontWeight),
    getValuePercentWidth: (id) => {
      // Setting off → header never shows the value+percentage cluster.
      if (!showParentValues) {
        return Infinity;
      }
      const node = getNode(id, tree);
      if (node == null) {
        return Infinity;
      }
      return (
        measureHeader(formatters.value(node.value), groupHeader.fontWeight) +
        groupHeader.valuePercentGap +
        measureHeader(formatShare(node.value), groupHeader.percentFontWeight)
      );
    },
    padding: groupHeader.paddingX,
  });

  return { labelLayout, parentLabelLayout };
}
