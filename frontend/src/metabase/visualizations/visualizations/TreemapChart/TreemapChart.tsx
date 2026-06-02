import type { EChartsType } from "echarts/core";
import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import _ from "underscore";

import { Box } from "metabase/ui";
import { extractRemappings } from "metabase/visualizations";
import { ResponsiveEChartsRenderer } from "metabase/visualizations/components/EChartsRenderer";
import { TREEMAP_CHART_STYLE } from "metabase/visualizations/echarts/graph/treemap/constants";
import { getTreemapBreadcrumbModel } from "metabase/visualizations/echarts/graph/treemap/model/breadcrumb";
import { getTreemapColors } from "metabase/visualizations/echarts/graph/treemap/model/colors";
import {
  getTreemapChartColumns,
  getTreemapData,
} from "metabase/visualizations/echarts/graph/treemap/model/data";
import { getTreemapFormatters } from "metabase/visualizations/echarts/graph/treemap/model/formatters";
import {
  getTreemapLabelVisibility,
  getTreemapLayoutNodes,
} from "metabase/visualizations/echarts/graph/treemap/model/labels";
import {
  DRILLED_BOTTOM_INSET,
  getTreemapChartOption,
} from "metabase/visualizations/echarts/graph/treemap/option/option";
import { getTreemapTooltipOption } from "metabase/visualizations/echarts/graph/treemap/option/tooltip";
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

// Font metrics for measuring whether a tile label fits its rendered width.
// Derived from the same constants the option's `label` style uses, so the
// measurement matches what ECharts draws (`label.position`'s first component is
// the inset on every side).
const LABEL_FONT_STYLE = {
  size: TREEMAP_CHART_STYLE.nodeLabels.size,
  family: TREEMAP_CHART_STYLE.nodeLabels.fontFamily,
  weight: TREEMAP_CHART_STYLE.nodeLabels.fontWeight,
};
const LABEL_FONT_SIZE = TREEMAP_CHART_STYLE.nodeLabels.size;
const LABEL_PADDING = TREEMAP_CHART_STYLE.nodeLabels.position[0];

export const TreemapChart = ({
  rawSeries,
  settings,
  fontFamily,
}: VisualizationProps) => {
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
  // Per-leaf label show/hide, measured against rendered tile widths after each
  // layout (the second pass — see `handleLabelMeasure`). Empty until the first
  // `finished`; the option builder falls back to its area-share heuristic for
  // any id not yet measured, so the first paint is sensible.
  const [labelVisibility, setLabelVisibility] = useState<
    Record<string, boolean>
  >({});
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

  const renderingContext = useBrowserRenderingContext({ fontFamily });

  const option = useMemo(() => {
    if (!chartData) {
      return null;
    }
    const { tree, colors, treemapColumns } = chartData;
    const seriesOption = getTreemapChartOption({
      tree,
      colors,
      isDrilled: viewRootId != null,
      labelVisibility,
      renderingContext,
    });
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
  }, [chartData, settings, viewRootId, labelVisibility, renderingContext]);

  const handleInit = useCallback((chart: EChartsType) => {
    chartRef.current = chart;
  }, []);

  const hasChildren = Boolean(
    chartData?.tree.some((node) => node.children != null),
  );
  const { eventHandlers } = useChartEvents(hasChildren, handleViewRootChange);

  // Second pass of the label-fit decision: after ECharts finishes laying out (or
  // re-laying out on drill/resize), measure each tile's rendered width and hide
  // the labels that don't fit. Hiding a label never changes tile geometry, so
  // the next `finished` measures identically — the deep-equal guard returns the
  // same state reference, React bails, and the loop converges in one extra pass.
  const handleLabelMeasure = useCallback(() => {
    const chart = chartRef.current;
    if (!chart) {
      return;
    }
    const nodes = getTreemapLayoutNodes(chart);
    const nextVisibility = getTreemapLabelVisibility(nodes, {
      measureText: renderingContext.measureText,
      fontStyle: LABEL_FONT_STYLE,
      fontSize: LABEL_FONT_SIZE,
      padding: LABEL_PADDING,
    });
    setLabelVisibility((prev) =>
      _.isEqual(prev, nextVisibility) ? prev : nextVisibility,
    );
  }, [renderingContext]);

  const allEventHandlers = useMemo(
    () => [
      ...eventHandlers,
      { eventName: "finished", handler: handleLabelMeasure },
    ],
    [eventHandlers, handleLabelMeasure],
  );

  // A new dataset re-renders the chart at the absolute root, so reset the
  // tracked view root to the overview and clear the measured label map (its ids
  // belong to the previous tree).
  useEffect(() => {
    handleViewRootChange(null);
    setLabelVisibility({});
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
    <Box
      className={S.root}
      // Match the rounded-corner clip's bottom inset to the treemap content
      // rectangle: while drilled, ECharts reserves a bottom strip for the
      // breadcrumb, so the clip must inset the bottom by the same amount or the
      // bottom rounding lands in the empty strip instead of on the drilled tiles.
      style={
        {
          "--treemap-bottom-inset": `${viewRootId != null ? DRILLED_BOTTOM_INSET : 0}px`,
        } as CSSProperties
      }
      py={48}
      px={96}
      w="100%"
      h="100%"
    >
      <ResponsiveEChartsRenderer
        ref={containerRef}
        option={option}
        eventHandlers={allEventHandlers}
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
