import type { EChartsType } from "echarts/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLatest } from "react-use";

import { Box, Stack } from "metabase/ui";
import { extractRemappings } from "metabase/visualizations";
import { ResponsiveEChartsRenderer } from "metabase/visualizations/components/EChartsRenderer";
import { getTreemapBreadcrumbModel } from "metabase/visualizations/echarts/graph/treemap/model/breadcrumb";
import { getTreemapColors } from "metabase/visualizations/echarts/graph/treemap/model/colors";
import {
  getTreemapChartColumns,
  getTreemapData,
} from "metabase/visualizations/echarts/graph/treemap/model/data";
import { getTreemapFormatters } from "metabase/visualizations/echarts/graph/treemap/model/formatters";
import { shouldShowParentLabels } from "metabase/visualizations/echarts/graph/treemap/model/labels";
import { getTreemapInlineValueIds } from "metabase/visualizations/echarts/graph/treemap/model/tooltip";
import { isOverview } from "metabase/visualizations/echarts/graph/treemap/model/tree";
import { getTreemapChartOption } from "metabase/visualizations/echarts/graph/treemap/option/option";
import {
  getChartPadding,
  groupHeader,
} from "metabase/visualizations/echarts/graph/treemap/style";
import {
  useCloseTooltipOnScroll,
  useInjectSeriesColorsClasses,
} from "metabase/visualizations/echarts/tooltip";
import { useBrowserRenderingContext } from "metabase/visualizations/hooks/use-browser-rendering-context";
import type { VisualizationProps } from "metabase/visualizations/types";

import { TreemapBreadcrumb } from "./TreemapBreadcrumb";
import S from "./TreemapChart.module.css";
import { TREEMAP_CHART_DEFINITION } from "./chart-definition";
import { dispatchTreemapViewRoot, useChartEvents } from "./events";
import { type TreemapHoverOverlay, hideTreemapHoverOverlay } from "./overlay";
import { getTreemapTooltipOption } from "./tooltip";
import { useLabelMeasurement } from "./use-label-measurement";
import { usePointerTracking } from "./use-pointer-tracking";
import { useTreemapNavigation } from "./use-treemap-navigation";

export const TreemapChart = ({
  rawSeries,
  settings,
  fontFamily,
  onVisualizationClick,
  clicked,
  isDashboard,
  isDocument,
  gridSize,
}: VisualizationProps) => {
  const rawSeriesWithRemappings = useMemo(
    () => extractRemappings(rawSeries),
    [rawSeries],
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<EChartsType>();
  const overlayRef = useRef<TreemapHoverOverlay | null>(null);
  const isAnimatingRef = useRef(false);
  const clickedRef = useLatest(clicked);

  const { zrEventHandlers, getPointer } = usePointerTracking();

  const chartData = useMemo(() => {
    const cols = rawSeriesWithRemappings[0]?.data?.cols ?? [];
    const treemapColumns = getTreemapChartColumns(cols, settings);
    if (!treemapColumns) {
      return null;
    }
    const treemapRows = settings["treemap.rows"];
    const tree = getTreemapData(
      rawSeriesWithRemappings,
      treemapColumns,
      treemapRows,
      settings,
    );
    const colors = getTreemapColors(tree, treemapRows);
    return { tree, colors, treemapColumns };
  }, [rawSeriesWithRemappings, settings]);

  const { viewRootId, viewRootIdRef, setViewRoot } = useTreemapNavigation(
    chartData?.tree ?? null,
  );

  const renderingContext = useBrowserRenderingContext({ fontFamily });

  const formatters = useMemo(
    () =>
      chartData
        ? getTreemapFormatters(chartData.treemapColumns, settings)
        : null,
    [chartData, settings],
  );

  const { labelLayout, parentLabelLayout, handleLabelMeasure } =
    useLabelMeasurement({
      chartRef,
      tree: chartData?.tree ?? null,
      formatters,
      renderingContext,
      viewRootId,
      showLeafLabels: settings["treemap.show_leaf_labels"] ?? true,
      showLeafValues: settings["treemap.show_leaf_values"] ?? true,
      showParentValues: settings["treemap.show_parent_values"] ?? true,
      gridSize,
    });

  const isCompact = isDashboard || isDocument;

  const option = useMemo(() => {
    const showLeafLabels = settings["treemap.show_leaf_labels"] ?? true;
    if (!chartData || !formatters) {
      return null;
    }
    const { tree, colors, treemapColumns } = chartData;
    const showParentLabels = shouldShowParentLabels(gridSize, settings);
    const seriesOption = getTreemapChartOption({
      tree,
      colors,
      isDrilled: viewRootId !== null,
      showParentLabels,
      showLeafLabels,
      isCompact,
      labelLayout,
      parentLabelLayout,
      formatValue: formatters.value,
      formatPercent: formatters.percent,
      renderingContext,
    });

    const headerHeight = showParentLabels
      ? isCompact
        ? groupHeader.compactHeight
        : groupHeader.height
      : 0;

    return {
      ...seriesOption,
      tooltip: getTreemapTooltipOption(
        tree,
        colors,
        formatters.value,
        formatters.percent,
        containerRef,
        () => viewRootIdRef.current,
        () => clickedRef.current != null,
        () => isAnimatingRef.current,
        () => chartRef.current,
        getPointer,
        headerHeight,
        getTreemapInlineValueIds(labelLayout, parentLabelLayout),
        treemapColumns.grouping.column.display_name,
      ),
    };
  }, [
    chartData,
    gridSize,
    formatters,
    settings,
    viewRootId,
    viewRootIdRef,
    isCompact,
    labelLayout,
    parentLabelLayout,
    renderingContext,
    clickedRef,
    getPointer,
  ]);

  const [chartInstance, setChartInstance] = useState<EChartsType>();
  const handleInit = useCallback((chart: EChartsType) => {
    chartRef.current = chart;
    setChartInstance(chart);
  }, []);

  const handleResize = useCallback(
    (_width: number, _height: number) => {
      hideTreemapHoverOverlay(chartRef, overlayRef);
      handleLabelMeasure();
    },
    [handleLabelMeasure],
  );

  const hasChildren = Boolean(
    chartData?.tree.some((node) => node.children != null),
  );
  const { eventHandlers } = useChartEvents({
    chartRef,
    overlayRef,
    hasChildren,
    isDrilled: !isOverview(viewRootId),
    onDrillToGroup: setViewRoot,
    tree: chartData?.tree ?? [],
    treemapColumns: chartData?.treemapColumns ?? null,
    rawSeries: rawSeriesWithRemappings,
    settings,
    onVisualizationClick,
  });

  const handleFinished = useCallback(() => {
    isAnimatingRef.current = false;
    handleLabelMeasure();
  }, [handleLabelMeasure]);

  const allEventHandlers = useMemo(
    () => [
      ...eventHandlers,
      { eventName: "finished", handler: handleFinished },
    ],
    [eventHandlers, handleFinished],
  );

  // reapply current zoom level that lives outside echarts
  useEffect(() => {
    hideTreemapHoverOverlay(chartRef, overlayRef);
    dispatchTreemapViewRoot(chartRef, viewRootId);
  }, [option, viewRootId]);

  const prevViewRootIdRef = useRef(viewRootId);
  useEffect(() => {
    const isDrillTransition = prevViewRootIdRef.current !== viewRootId;
    prevViewRootIdRef.current = viewRootId;
    if (isDrillTransition) {
      isAnimatingRef.current = true;
    } else {
      handleLabelMeasure();
    }
  }, [chartInstance, option, viewRootId, handleLabelMeasure]);

  const breadcrumb = chartData
    ? getTreemapBreadcrumbModel(chartData.tree, viewRootId)
    : null;

  const handleBreadcrumbBack = useCallback(() => {
    setViewRoot(null);
  }, [setViewRoot]);

  useCloseTooltipOnScroll(chartRef);

  const colorsCss = useInjectSeriesColorsClasses(
    useMemo(() => Object.values(chartData?.colors ?? {}), [chartData]),
  );

  if (!option) {
    return null;
  }

  return (
    <Stack
      w="100%"
      h="100%"
      display="flex"
      style={{ flexDirection: "column" }}
      gap={isCompact ? "md" : 28}
    >
      {breadcrumb && formatters && (
        <Box px={isDashboard ? "md" : "xl"} pt={isDashboard ? 12 : 24}>
          <TreemapBreadcrumb
            groupLabel={breadcrumb.groupLabel}
            value={formatters.value(breadcrumb.value)}
            onBackClick={handleBreadcrumbBack}
          />
        </Box>
      )}
      <Box
        className={S.root}
        p={getChartPadding(isDashboard)}
        w="100%"
        style={{ flex: 1, minHeight: 0 }}
      >
        <ResponsiveEChartsRenderer
          ref={containerRef}
          option={option}
          eventHandlers={allEventHandlers}
          zrEventHandlers={zrEventHandlers}
          onInit={handleInit}
          onResize={handleResize}
        />
        {colorsCss}
      </Box>
    </Stack>
  );
};

Object.assign(TreemapChart, TREEMAP_CHART_DEFINITION);
