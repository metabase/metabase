import { type MutableRefObject, useCallback, useRef, useState } from "react";
import _ from "underscore";

import {
  type EChartsType,
  type NodeId,
  type ParentLabelLayout,
  type RenderingContext,
  type TreemapFormatters,
  type TreemapLabelLayout,
  type TreemapTree,
  getTreemapLayoutNodes,
  measureTreemapLabelLayouts,
} from "metabase/viz-core";

interface UseLabelMeasurementOptions {
  chartRef: MutableRefObject<EChartsType | undefined>;
  tree: TreemapTree | null;
  formatters: TreemapFormatters | null;
  renderingContext: RenderingContext;
  /** The view root the chart is currently showing (null at the overview). */
  viewRootId: NodeId | null;
  showLeafLabels: boolean;
  showLeafValues: boolean;
  showParentValues: boolean;
  gridSize?: { width: number; height: number };
}

interface MeasurementKey {
  tree: TreemapTree | null;
  viewRootId: NodeId | null;
  renderingContext: RenderingContext | null;
  formatters: TreemapFormatters | null;
  showLeafLabels: boolean;
  showLeafValues: boolean;
  showParentValues: boolean;
  gridSize?: { width: number; height: number };
}

interface MeasuredLayouts extends MeasurementKey {
  leafLabelLayout: Record<NodeId, TreemapLabelLayout>;
  parentLabelLayout: Record<NodeId, ParentLabelLayout>;
}

const EMPTY_MEASURED: MeasuredLayouts = {
  tree: null,
  viewRootId: null,
  renderingContext: null,
  formatters: null,
  showLeafLabels: false,
  showLeafValues: false,
  showParentValues: false,
  gridSize: undefined,
  leafLabelLayout: {},
  parentLabelLayout: {},
};

function isMeasuredFor(measured: MeasurementKey, key: MeasurementKey): boolean {
  return (
    measured.tree === key.tree &&
    measured.viewRootId === key.viewRootId &&
    measured.renderingContext === key.renderingContext &&
    measured.formatters === key.formatters &&
    measured.showLeafLabels === key.showLeafLabels &&
    measured.showLeafValues === key.showLeafValues &&
    measured.showParentValues === key.showParentValues &&
    _.isEqual(measured.gridSize, key.gridSize)
  );
}

export function useLabelMeasurement({
  chartRef,
  tree,
  formatters,
  renderingContext,
  viewRootId,
  showLeafLabels,
  showLeafValues,
  showParentValues,
  gridSize,
}: UseLabelMeasurementOptions) {
  const [measured, setMeasured] = useState<MeasuredLayouts>(EMPTY_MEASURED);

  const currentKey: MeasurementKey = {
    tree,
    viewRootId,
    renderingContext,
    formatters,
    showLeafLabels,
    showLeafValues,
    showParentValues,
    gridSize,
  };
  const currentKeyRef = useRef(currentKey);
  currentKeyRef.current = currentKey;

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
      showLeafLabels,
      showLeafValues,
      showParentValues,
      gridSize,
    };
    const { leafLabelLayout, parentLabelLayout } = measureTreemapLabelLayouts({
      nodes: getTreemapLayoutNodes(chart),
      tree,
      formatters,
      renderingContext,
      showLeafLabels,
      showLeafValues,
      showParentValues,
    });
    setMeasured((prev) => {
      if (!isMeasuredFor(currentKeyRef.current, key)) {
        return prev;
      }
      return isMeasuredFor(prev, key) &&
        _.isEqual(prev.leafLabelLayout, leafLabelLayout) &&
        _.isEqual(prev.parentLabelLayout, parentLabelLayout)
        ? prev
        : { ...key, leafLabelLayout: leafLabelLayout, parentLabelLayout };
    });
  }, [
    chartRef,
    tree,
    formatters,
    renderingContext,
    viewRootId,
    showLeafLabels,
    showLeafValues,
    showParentValues,
    gridSize,
  ]);

  const isStale = !isMeasuredFor(measured, currentKey);

  return {
    labelLayout: isStale
      ? EMPTY_MEASURED.leafLabelLayout
      : measured.leafLabelLayout,
    parentLabelLayout: isStale
      ? EMPTY_MEASURED.parentLabelLayout
      : measured.parentLabelLayout,
    handleLabelMeasure,
  };
}
