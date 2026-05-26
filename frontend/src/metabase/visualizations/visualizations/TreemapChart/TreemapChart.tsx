import type { EChartsType } from "echarts/core";
import { useCallback, useMemo, useRef } from "react";

import { extractRemappings } from "metabase/visualizations";
import { ResponsiveEChartsRenderer } from "metabase/visualizations/components/EChartsRenderer";
import {
  getTreemapChartColumns,
  getTreemapData,
} from "metabase/visualizations/echarts/graph/treemap/model/data";
import { getTreemapChartOption } from "metabase/visualizations/echarts/graph/treemap/option/option";
import type { VisualizationProps } from "metabase/visualizations/types";

export const TreemapChart = ({ rawSeries, settings }: VisualizationProps) => {
  const rawSeriesWithRemappings = useMemo(
    () => extractRemappings(rawSeries),
    [rawSeries],
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<EChartsType>();

  const option = useMemo(() => {
    const cols = rawSeriesWithRemappings[0]?.data?.cols ?? [];
    const treemapColumns = getTreemapChartColumns(cols, settings);
    if (!treemapColumns) {
      return null;
    }
    const tree = getTreemapData(rawSeriesWithRemappings, treemapColumns);
    return getTreemapChartOption(tree);
  }, [rawSeriesWithRemappings, settings]);

  const handleInit = useCallback((chart: EChartsType) => {
    chartRef.current = chart;
  }, []);

  if (!option) {
    return null;
  }

  return (
    <ResponsiveEChartsRenderer
      ref={containerRef}
      option={option}
      onInit={handleInit}
    />
  );
};
