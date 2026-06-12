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
  viewRootId: NodeId | null /* the root used for current measurements */;
  showLeafValues: boolean;
  showParentValues: boolean;
}

interface MeasuredLayouts {
  viewRootId: NodeId | null;
  labelLayout: Record<NodeId, TreemapLabelLayout>;
  parentLabelLayout: Record<NodeId, TreemapParentLabelLayout>;
}

const EMPTY_MEASURED: MeasuredLayouts = {
  viewRootId: null,
  labelLayout: {},
  parentLabelLayout: {},
};

const EMPTY_LABEL_LAYOUT: Record<NodeId, TreemapLabelLayout> = {};
const EMPTY_PARENT_LABEL_LAYOUT: Record<NodeId, TreemapParentLabelLayout> = {};

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

  useEffect(() => {
    setMeasured(EMPTY_MEASURED);
  }, [tree]);

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
    setMeasured((prev) => {
      const next = { viewRootId, labelLayout, parentLabelLayout };
      return _.isEqual(prev, next) ? prev : next;
    });
  }, [
    chartRef,
    tree,
    formatters,
    renderingContext,
    viewRootId,
    showLeafValues,
    showParentValues,
  ]);

  const animationInProgress = measured.viewRootId !== viewRootId;

  return {
    labelLayout: animationInProgress
      ? EMPTY_LABEL_LAYOUT
      : measured.labelLayout,
    parentLabelLayout: animationInProgress
      ? EMPTY_PARENT_LABEL_LAYOUT
      : measured.parentLabelLayout,
    handleLabelMeasure,
  };
}
