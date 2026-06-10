import type { EChartsType } from "echarts/core";
import { type MutableRefObject, useCallback, useEffect, useState } from "react";
import _ from "underscore";

import type { TreemapFormatters } from "metabase/visualizations/echarts/graph/treemap/model/formatters";
import type {
  TreemapLabelLayout,
  TreemapParentLabelLayout,
} from "metabase/visualizations/echarts/graph/treemap/model/labels";
import { measureTreemapLabelLayouts } from "metabase/visualizations/echarts/graph/treemap/model/measure";
import { getTreemapLayoutNodes } from "metabase/visualizations/echarts/graph/treemap/model/tree";
import type {
  NodeId,
  TreemapTree,
} from "metabase/visualizations/echarts/graph/treemap/model/types";
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
 * which labels show and how wide they wrap (see `measureTreemapLabelLayouts`).
 * Changing only `label.show`/`width` never changes tile geometry, so the next
 * `finished` reads identically — the deep-equal guard returns the same state
 * reference, React bails, and the loop converges in one extra pass.
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
    const { labelLayout: nextLayout, parentLabelLayout: nextParentLayout } =
      measureTreemapLabelLayouts({
        nodes: getTreemapLayoutNodes(chart),
        tree,
        formatters,
        renderingContext,
        showLeafValues,
        showParentValues,
      });
    setLabelLayout((prev) => (_.isEqual(prev, nextLayout) ? prev : nextLayout));
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
