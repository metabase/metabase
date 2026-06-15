import type { RenderingContext } from "metabase/visualizations/types";

import { TREEMAP_CHART_STYLE, groupHeader, leafBlock } from "../style";

import {
  type TreemapFormatters,
  getTreemapPercentOfTotalFormatter,
} from "./formatters";
import {
  type ParentLabelLayout,
  type TreemapLabelLayout,
  getAllParentLabelLayouts,
  getAllTileLabelLayouts,
} from "./labels";
import { getNode } from "./tree";
import type { NodeId, TreemapLayoutNode, TreemapTree } from "./types";

export interface TreemapMeasuredLabelLayouts {
  labelLayout: Record<NodeId, TreemapLabelLayout>;
  parentLabelLayout: Record<NodeId, ParentLabelLayout>;
}

/**
 * Based on real rendered sizes of headers and tiles, decide which labels show
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
  const formatShare = getTreemapPercentOfTotalFormatter(
    tree,
    formatters.percent,
  );

  const labelLayout = getAllTileLabelLayouts(nodes, {
    getValueLabelWidth: (id) => {
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

  const measureHeader = (text: string, weight: number) =>
    renderingContext.measureText(text, {
      size: groupHeader.fontSize,
      family: renderingContext.fontFamily,
      weight,
    });
  const parentLabelLayout = getAllParentLabelLayouts(nodes, {
    getLabel: (id) => getNode(id, tree)?.displayName,
    measureTextWidth: (text) => measureHeader(text, groupHeader.fontWeight),
    getValuePercentWidth: (id) => {
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
  });

  return { labelLayout, parentLabelLayout };
}
