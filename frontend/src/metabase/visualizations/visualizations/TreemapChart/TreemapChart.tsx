import type { EChartsType } from "echarts/core";
import { useCallback, useEffect, useMemo, useRef } from "react";

import { extractRemappings } from "metabase/visualizations";
import { ResponsiveEChartsRenderer } from "metabase/visualizations/components/EChartsRenderer";
import { getTreemapColors } from "metabase/visualizations/echarts/graph/treemap/model/colors";
import {
  getTreemapChartColumns,
  getTreemapData,
} from "metabase/visualizations/echarts/graph/treemap/model/data";
import { getTreemapFormatters } from "metabase/visualizations/echarts/graph/treemap/model/formatters";
import type { TreemapTree } from "metabase/visualizations/echarts/graph/treemap/model/types";
import { getTreemapChartOption } from "metabase/visualizations/echarts/graph/treemap/option/option";
import { getTreemapTooltipOption } from "metabase/visualizations/echarts/graph/treemap/option/tooltip";
import {
  useCloseTooltipOnScroll,
  useInjectSeriesColorsClasses,
} from "metabase/visualizations/echarts/tooltip";
import type { VisualizationProps } from "metabase/visualizations/types";

import { TREEMAP_CHART_DEFINITION } from "./chart-definition";
import { useChartEvents } from "./events";

// Stable fallback so `useChartEvents` deps don't churn while chartData is null.
const EMPTY_TREE: TreemapTree = [];

export const TreemapChart = ({ rawSeries, settings }: VisualizationProps) => {
  const rawSeriesWithRemappings = useMemo(
    () => extractRemappings(rawSeries),
    [rawSeries],
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<EChartsType>();
  // `null` = overview (initial 2-level view); `"0".."N-1"` = drilled into that
  // top-level group. Tracked from `treemaproottonode` events (see events.ts);
  // read live by the tooltip formatter.
  const viewRootIdRef = useRef<string | null>(null);

  const chartData = useMemo(() => {
    const cols = rawSeriesWithRemappings[0]?.data?.cols ?? [];
    const treemapColumns = getTreemapChartColumns(cols, settings);
    if (!treemapColumns) {
      return null;
    }
    const tree = getTreemapData(rawSeriesWithRemappings, treemapColumns);
    const colors = getTreemapColors(tree);
    return { tree, colors, treemapColumns };
  }, [rawSeriesWithRemappings, settings]);

  const option = useMemo(() => {
    if (!chartData) {
      return null;
    }
    const { tree, colors, treemapColumns } = chartData;
    const seriesOption = getTreemapChartOption(tree, colors);
    const formatters = getTreemapFormatters(treemapColumns, settings);

    return {
      ...seriesOption,
      tooltip: getTreemapTooltipOption(
        tree,
        colors,
        formatters.value,
        containerRef,
        () => viewRootIdRef.current,
        treemapColumns.grouping.column.display_name,
      ),
    };
  }, [chartData, settings]);

  const handleInit = useCallback((chart: EChartsType) => {
    chartRef.current = chart;
  }, []);

  const hasChildren = Boolean(
    chartData?.tree.some((node) => node.children != null),
  );
  const { eventHandlers } = useChartEvents(
    chartRef,
    hasChildren,
    chartData?.tree ?? EMPTY_TREE,
    viewRootIdRef,
  );

  // A new dataset re-renders the chart at the absolute root, so reset the
  // tracked view root to the overview.
  useEffect(() => {
    viewRootIdRef.current = null;
  }, [chartData]);

  useCloseTooltipOnScroll(chartRef);

  const colorsCss = useInjectSeriesColorsClasses(
    useMemo(() => Object.values(chartData?.colors ?? {}), [chartData]),
  );

  if (!option) {
    return null;
  }

  return (
    <>
      <ResponsiveEChartsRenderer
        ref={containerRef}
        option={option}
        eventHandlers={eventHandlers}
        onInit={handleInit}
      />
      {colorsCss}
    </>
  );
};

Object.assign(TreemapChart, TREEMAP_CHART_DEFINITION);
