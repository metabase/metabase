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
import { shouldShowParentLabels } from "metabase/visualizations/echarts/graph/treemap/model/labels";
import { getTreemapInlineValueIds } from "metabase/visualizations/echarts/graph/treemap/model/tooltip";
import type { NodeId } from "metabase/visualizations/echarts/graph/treemap/model/types";
import { getTreemapChartOption } from "metabase/visualizations/echarts/graph/treemap/option/option";
import { getTreemapTooltipOption } from "metabase/visualizations/echarts/graph/treemap/option/tooltip";
import { getChartPadding } from "metabase/visualizations/echarts/graph/treemap/style";
import {
  useCloseTooltipOnScroll,
  useInjectSeriesColorsClasses,
} from "metabase/visualizations/echarts/tooltip";
import { useBrowserRenderingContext } from "metabase/visualizations/hooks/use-browser-rendering-context";
import type { VisualizationProps } from "metabase/visualizations/types";

import { TreemapBreadcrumb } from "./TreemapBreadcrumb";
import S from "./TreemapChart.module.css";
import { TREEMAP_CHART_DEFINITION } from "./chart-definition";
import {
  type TreemapHoverOverlay,
  dispatchTreemapViewRoot,
  hideTreemapHoverOverlay,
  useChartEvents,
} from "./events";
import { useLabelMeasurement } from "./use-label-measurement";

export const TreemapChart = ({
  rawSeries,
  settings,
  fontFamily,
  onVisualizationClick,
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
  const [viewRootId, setViewRootId] = useState<NodeId | null>(null);
  const viewRootIdRef = useRef<string | null>(null);
  const handleViewRootChange = useCallback((id: NodeId | null) => {
    viewRootIdRef.current = id;
    setViewRootId(id);
  }, []);

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
    );
    const colors = getTreemapColors(tree, treemapRows);
    return { tree, colors, treemapColumns };
  }, [rawSeriesWithRemappings, settings]);

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
      showLeafValues: settings["treemap.show_leaf_values"] ?? true,
      showParentValues: settings["treemap.show_parent_values"] ?? true,
    });

  const option = useMemo(() => {
    const showLeafLabels = settings["treemap.show_leaf_labels"] ?? true;
    if (!chartData || !formatters) {
      return null;
    }
    const { tree, colors, treemapColumns } = chartData;
    const seriesOption = getTreemapChartOption({
      tree,
      colors,
      isDrilled: viewRootId !== null,
      showParentLabels: shouldShowParentLabels(gridSize, settings),
      showLeafLabels,
      labelLayout,
      parentLabelLayout,
      formatValue: formatters.value,
      renderingContext,
    });

    return {
      ...seriesOption,
      tooltip: getTreemapTooltipOption(
        tree,
        colors,
        formatters.value,
        containerRef,
        () => viewRootIdRef.current,
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
    labelLayout,
    parentLabelLayout,
    renderingContext,
  ]);

  const handleInit = useCallback((chart: EChartsType) => {
    chartRef.current = chart;
  }, []);

  const hasChildren = Boolean(
    chartData?.tree.some((node) => node.children != null),
  );
  const { eventHandlers } = useChartEvents({
    chartRef,
    overlayRef,
    hasChildren,
    isDrilled: viewRootId != null,
    onDrillToGroup: handleViewRootChange,
    tree: chartData?.tree ?? [],
    treemapColumns: chartData?.treemapColumns ?? null,
    rawSeries: rawSeriesWithRemappings,
    settings,
    onVisualizationClick,
  });

  const allEventHandlers = useMemo(
    () => [
      ...eventHandlers,
      { eventName: "finished", handler: handleLabelMeasure },
    ],
    [eventHandlers, handleLabelMeasure],
  );

  useEffect(() => {
    handleViewRootChange(null);
  }, [chartData, handleViewRootChange]);

  // reapply current zoom level that lives outside of echarts
  useEffect(() => {
    hideTreemapHoverOverlay(chartRef, overlayRef);
    dispatchTreemapViewRoot(chartRef, viewRootId);
  }, [option, viewRootId]);

  const breadcrumb = chartData
    ? getTreemapBreadcrumbModel(chartData.tree, viewRootId)
    : null;

  const handleBreadcrumbBack = useCallback(() => {
    handleViewRootChange(null);
  }, [handleViewRootChange]);

  useCloseTooltipOnScroll(chartRef);

  const isCompact = isDashboard || isDocument;

  const colorsCss = useInjectSeriesColorsClasses(
    useMemo(() => Object.values(chartData?.colors ?? {}), [chartData]),
  );

  if (!option) {
    return null;
  }

  return (
    <Box w="100%" h="100%" display="flex" style={{ flexDirection: "column" }}>
      {breadcrumb && formatters && (
        <TreemapBreadcrumb
          groupLabel={breadcrumb.groupLabel}
          value={formatters.value(breadcrumb.value)}
          onBackClick={handleBreadcrumbBack}
        />
      )}
      <Box
        className={S.root}
        p={getChartPadding(isCompact)}
        w="100%"
        style={{ flex: 1, minHeight: 0 }}
      >
        <ResponsiveEChartsRenderer
          ref={containerRef}
          option={option}
          eventHandlers={allEventHandlers}
          onInit={handleInit}
        />
        {colorsCss}
      </Box>
    </Box>
  );
};

Object.assign(TreemapChart, TREEMAP_CHART_DEFINITION);
