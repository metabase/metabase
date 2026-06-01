import type { EChartsType } from "echarts/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Box } from "metabase/ui";
import { extractRemappings } from "metabase/visualizations";
import { ResponsiveEChartsRenderer } from "metabase/visualizations/components/EChartsRenderer";
import { getTreemapBreadcrumbModel } from "metabase/visualizations/echarts/graph/treemap/model/breadcrumb";
import { getTreemapColors } from "metabase/visualizations/echarts/graph/treemap/model/colors";
import {
  getTreemapChartColumns,
  getTreemapData,
} from "metabase/visualizations/echarts/graph/treemap/model/data";
import { getTreemapFormatters } from "metabase/visualizations/echarts/graph/treemap/model/formatters";
import { getTreemapChartOption } from "metabase/visualizations/echarts/graph/treemap/option/option";
import { getTreemapTooltipOption } from "metabase/visualizations/echarts/graph/treemap/option/tooltip";
import {
  useCloseTooltipOnScroll,
  useInjectSeriesColorsClasses,
} from "metabase/visualizations/echarts/tooltip";
import type { VisualizationProps } from "metabase/visualizations/types";

import { TreemapBreadcrumb } from "./TreemapBreadcrumb";
import { TREEMAP_CHART_DEFINITION } from "./chart-definition";
import { dispatchTreemapViewRoot, useChartEvents } from "./events";

// Bottom inset (px) reserved for the breadcrumb overlay while drilled in. The
// overview uses 0 (full-bleed); see option.ts.
const BREADCRUMB_BOTTOM_SPACE = 48;

export const TreemapChart = ({ rawSeries, settings }: VisualizationProps) => {
  const rawSeriesWithRemappings = useMemo(
    () => extractRemappings(rawSeries),
    [rawSeries],
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<EChartsType>();
  // `null` = overview (initial 2-level view); `"0".."N-1"` = drilled into that
  // top-level group. The breadcrumb and the bottom inset render from
  // `viewRootId` state; the tooltip formatter reads the synced `viewRootIdRef`
  // live (its option is built once, so it can't close over state).
  // `handleViewRootChange` keeps both in sync.
  const [viewRootId, setViewRootId] = useState<string | null>(null);
  const viewRootIdRef = useRef<string | null>(null);
  const handleViewRootChange = useCallback((id: string | null) => {
    viewRootIdRef.current = id;
    setViewRootId(id);
  }, []);

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
    const bottomSpace = viewRootId != null ? BREADCRUMB_BOTTOM_SPACE : 0;
    const seriesOption = getTreemapChartOption(tree, colors, bottomSpace);
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
  }, [chartData, settings, viewRootId]);

  const handleInit = useCallback((chart: EChartsType) => {
    chartRef.current = chart;
  }, []);

  const hasChildren = Boolean(
    chartData?.tree.some((node) => node.children != null),
  );
  const { eventHandlers } = useChartEvents(hasChildren, handleViewRootChange);

  // A new dataset re-renders the chart at the absolute root, so reset the
  // tracked view root to the overview.
  useEffect(() => {
    handleViewRootChange(null);
  }, [chartData, handleViewRootChange]);

  // `setOption` (run by the renderer when `option` changes) always renders at
  // the absolute root, so after each change re-apply the drill for a drilled-in
  // view. This effect runs after the renderer's `setOption` effect (child
  // effects fire before parent effects). No canvas resize is involved, so the
  // layout stays clean.
  useEffect(() => {
    dispatchTreemapViewRoot(chartRef, viewRootId);
  }, [option, viewRootId]);

  const breadcrumb = chartData
    ? getTreemapBreadcrumbModel(chartData.tree, viewRootId)
    : null;

  const handleBreadcrumbAllClick = useCallback(() => {
    handleViewRootChange(null);
  }, [handleViewRootChange]);

  useCloseTooltipOnScroll(chartRef);

  const colorsCss = useInjectSeriesColorsClasses(
    useMemo(() => Object.values(chartData?.colors ?? {}), [chartData]),
  );

  if (!option) {
    return null;
  }

  return (
    <Box py={48} px={96} w="100%" h="100%">
      <ResponsiveEChartsRenderer
        ref={containerRef}
        option={option}
        eventHandlers={eventHandlers}
        onInit={handleInit}
      >
        {breadcrumb && (
          <TreemapBreadcrumb
            groupLabel={breadcrumb.groupLabel}
            onAllClick={handleBreadcrumbAllClick}
          />
        )}
      </ResponsiveEChartsRenderer>
      {colorsCss}
    </Box>
  );
};

Object.assign(TreemapChart, TREEMAP_CHART_DEFINITION);
