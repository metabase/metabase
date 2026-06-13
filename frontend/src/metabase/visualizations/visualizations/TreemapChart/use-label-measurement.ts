import type { EChartsType } from "echarts/core";
import { type MutableRefObject, useCallback, useState } from "react";
import _ from "underscore";

import type { TreemapFormatters } from "metabase/visualizations/echarts/graph/treemap/model/formatters";
import type {
  ParentLabelLayout,
  TreemapLabelLayout,
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
  /** The view root the chart is currently showing (null at the overview). */
  viewRootId: NodeId | null;
  showLeafValues: boolean;
  showParentValues: boolean;
}

interface MeasuredLayouts {
  tree: TreemapTree | null;
  viewRootId: NodeId | null;
  labelLayout: Record<NodeId, TreemapLabelLayout>;
  parentLabelLayout: Record<NodeId, ParentLabelLayout>;
}

const EMPTY_MEASURED: MeasuredLayouts = {
  tree: null,
  viewRootId: null,
  labelLayout: {},
  parentLabelLayout: {},
};

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
  viewRootId,
  showLeafValues,
  showParentValues,
}: UseLabelMeasurementOptions) {
  const [measured, setMeasured] = useState<MeasuredLayouts>(EMPTY_MEASURED);

  const handleLabelMeasure = useCallback(() => {
    const chart = chartRef.current;
    if (!chart || !tree || !formatters) {
      return;
    }
    const { labelLayout, parentLabelLayout } = measureTreemapLabelLayouts({
      nodes: getTreemapLayoutNodes(chart),
      tree,
      formatters,
      renderingContext,
      showLeafValues,
      showParentValues,
    });
    setMeasured((prev) =>
      prev.tree === tree &&
      prev.viewRootId === viewRootId &&
      _.isEqual(prev.labelLayout, labelLayout) &&
      _.isEqual(prev.parentLabelLayout, parentLabelLayout)
        ? prev
        : { tree, viewRootId, labelLayout, parentLabelLayout },
    );
  }, [
    chartRef,
    tree,
    formatters,
    renderingContext,
    viewRootId,
    showLeafValues,
    showParentValues,
  ]);

  // Measurements are only valid for the exact tree and view root they were measured at
  const isStale = measured.tree !== tree || measured.viewRootId !== viewRootId;

  return {
    labelLayout: isStale ? EMPTY_MEASURED.labelLayout : measured.labelLayout,
    parentLabelLayout: isStale
      ? EMPTY_MEASURED.parentLabelLayout
      : measured.parentLabelLayout,
    handleLabelMeasure,
  };
}
