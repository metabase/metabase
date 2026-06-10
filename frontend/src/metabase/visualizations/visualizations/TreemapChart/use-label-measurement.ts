import type { EChartsType } from "echarts/core";
import { type MutableRefObject, useCallback, useEffect, useState } from "react";
import _ from "underscore";

import { formatPercent } from "metabase/static-viz/lib/numbers";
import type { TreemapFormatters } from "metabase/visualizations/echarts/graph/treemap/model/formatters";
import {
  MIN_FULL_LABEL_TILE_HEIGHT,
  MIN_LABEL_TILE_HEIGHT,
  MIN_LABEL_TILE_WIDTH,
  type TreemapLabelLayout,
  type TreemapParentLabelLayout,
  getTreemapLabelLayouts,
  getTreemapParentLabelLayouts,
} from "metabase/visualizations/echarts/graph/treemap/model/labels";
import {
  getNode,
  getTreemapLayoutNodes,
} from "metabase/visualizations/echarts/graph/treemap/model/tree";
import type {
  NodeId,
  TreemapTree,
} from "metabase/visualizations/echarts/graph/treemap/model/types";
import {
  LABEL_PADDING,
  TREEMAP_CHART_STYLE,
  groupHeader,
  leafBlock,
} from "metabase/visualizations/echarts/graph/treemap/style";
import type { RenderingContext } from "metabase/visualizations/types";

interface UseLabelMeasurementOptions {
  chartRef: MutableRefObject<EChartsType | undefined>;
  tree: TreemapTree | null;
  formatters: TreemapFormatters | null;
  renderingContext: RenderingContext;
  showLeafValues: boolean;
  showParentValues: boolean;
}

/**
 * Second pass of the label layout: after ECharts finishes laying out (or
 * re-laying out on drill/resize), read each tile's rendered size and recompute
 * which labels show and how wide they wrap. Changing only `label.show`/`width`
 * never changes tile geometry, so the next `finished` reads identically — the
 * deep-equal guard returns the same state reference, React bails, and the loop
 * converges in one extra pass.
 *
 * Wire `handleLabelMeasure` to the chart's `finished` event and feed the
 * returned layouts back into the option builder.
 */
export function useLabelMeasurement({
  chartRef,
  tree,
  formatters,
  renderingContext,
  showLeafValues,
  showParentValues,
}: UseLabelMeasurementOptions) {
  const [labelLayout, setLabelLayout] = useState<
    Record<NodeId, TreemapLabelLayout>
  >({});
  const [parentLabelLayout, setParentLabelLayout] = useState<
    Record<NodeId, TreemapParentLabelLayout>
  >({});

  // A new dataset re-renders the chart from scratch, so clear the measured
  // label maps — their ids belong to the previous tree.
  useEffect(() => {
    setLabelLayout({});
    setParentLabelLayout({});
  }, [tree]);

  const handleLabelMeasure = useCallback(() => {
    const chart = chartRef.current;
    if (!chart || !tree || !formatters) {
      return;
    }
    const nodes = getTreemapLayoutNodes(chart);
    const total = tree.reduce((sum, node) => sum + node.value, 0);
    const formatShare = (value: number) =>
      formatPercent(total === 0 ? 0 : value / total);

    // Leaf tiles qualify for the "full" stacked block only when the value line
    // (the widest, at the H3 font) fits the tile width, so measure it at that
    // font. The value renders in the leaf-label font family (see the rich style
    // in `option.ts`), so measure with the same family.
    const nextLayout = getTreemapLabelLayouts(nodes, {
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
    setLabelLayout((prev) => (_.isEqual(prev, nextLayout) ? prev : nextLayout));

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
    const nextParentLayout = getTreemapParentLabelLayouts(nodes, {
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
    setParentLabelLayout((prev) =>
      _.isEqual(prev, nextParentLayout) ? prev : nextParentLayout,
    );
  }, [
    chartRef,
    tree,
    formatters,
    renderingContext,
    showLeafValues,
    showParentValues,
  ]);

  return { labelLayout, parentLabelLayout, handleLabelMeasure };
}
