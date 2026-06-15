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

interface MeasurementKey {
  tree: TreemapTree | null;
  viewRootId: NodeId | null;
  renderingContext: RenderingContext | null;
  formatters: TreemapFormatters | null;
  showLeafValues: boolean;
  showParentValues: boolean;
}

interface MeasuredLayouts extends MeasurementKey {
  labelLayout: Record<NodeId, TreemapLabelLayout>;
  parentLabelLayout: Record<NodeId, ParentLabelLayout>;
}

const EMPTY_MEASURED: MeasuredLayouts = {
  tree: null,
  viewRootId: null,
  renderingContext: null,
  formatters: null,
  showLeafValues: false,
  showParentValues: false,
  labelLayout: {},
  parentLabelLayout: {},
};

function isMeasuredFor(
  measured: MeasuredLayouts,
  key: MeasurementKey,
): boolean {
  return (
    measured.tree === key.tree &&
    measured.viewRootId === key.viewRootId &&
    measured.renderingContext === key.renderingContext &&
    measured.formatters === key.formatters &&
    measured.showLeafValues === key.showLeafValues &&
    measured.showParentValues === key.showParentValues
  );
}

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
    const key: MeasurementKey = {
      tree,
      viewRootId,
      renderingContext,
      formatters,
      showLeafValues,
      showParentValues,
    };
    const { labelLayout, parentLabelLayout } = measureTreemapLabelLayouts({
      nodes: getTreemapLayoutNodes(chart),
      tree,
      formatters,
      renderingContext,
      showLeafValues,
      showParentValues,
    });
    setMeasured((prev) =>
      isMeasuredFor(prev, key) &&
      _.isEqual(prev.labelLayout, labelLayout) &&
      _.isEqual(prev.parentLabelLayout, parentLabelLayout)
        ? prev
        : { ...key, labelLayout, parentLabelLayout },
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

  // Measurements are only valid for the exact inputs they were measured at.
  const isStale = !isMeasuredFor(measured, {
    tree,
    viewRootId,
    renderingContext,
    formatters,
    showLeafValues,
    showParentValues,
  });

  return {
    labelLayout: isStale ? EMPTY_MEASURED.labelLayout : measured.labelLayout,
    parentLabelLayout: isStale
      ? EMPTY_MEASURED.parentLabelLayout
      : measured.parentLabelLayout,
    handleLabelMeasure,
  };
}
