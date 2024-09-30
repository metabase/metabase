import type { EChartsType } from "echarts/core";
import { type MouseEvent, useCallback, useMemo, useRef, useState } from "react";
import { useSet } from "react-use";

import { isNotNull } from "metabase/lib/types";
import ChartWithLegend from "metabase/visualizations/components/ChartWithLegend";
import { ResponsiveEChartsRenderer } from "metabase/visualizations/components/EChartsRenderer";
import { getPieChartFormatters } from "metabase/visualizations/echarts/pie/format";
import { getPieChartModel } from "metabase/visualizations/echarts/pie/model";
import { getPieChartOption } from "metabase/visualizations/echarts/pie/option";
import { getTooltipOption } from "metabase/visualizations/echarts/pie/tooltip";
import {
  useCloseTooltipOnScroll,
  usePieChartValuesColorsClasses,
} from "metabase/visualizations/echarts/tooltip";
import { useBrowserRenderingContext } from "metabase/visualizations/hooks/use-browser-rendering-context";
import type { VisualizationProps } from "metabase/visualizations/types";

import { PIE_CHART_DEFINITION } from "./chart-definition";
import { useChartEvents } from "./use-chart-events";

Object.assign(PieChart, PIE_CHART_DEFINITION);

export function PieChart(props: VisualizationProps) {
  const {
    fontFamily,
    rawSeries,
    settings,
    onRender,
    isDashboard,
    isFullscreen,
  } = props;
  const hoveredIndex = props.hovered?.index;

  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<EChartsType>();
  const [sideLength, setSideLength] = useState(0);

  const [hiddenSlices, { toggle: toggleSliceVisibility }] = useSet<
    string | number
  >();

  const showWarning = useCallback(
    (warning: string) => onRender({ warnings: [warning] }),
    [onRender],
  );

  const renderingContext = useBrowserRenderingContext({
    fontFamily,
    isDashboard,
    isFullscreen,
  });
  const chartModel = useMemo(
    () =>
      getPieChartModel(
        rawSeries,
        settings,
        Array.from(hiddenSlices),
        renderingContext,
        showWarning,
      ),
    [rawSeries, settings, hiddenSlices, renderingContext, showWarning],
  );
  const formatters = useMemo(
    () => getPieChartFormatters(chartModel, settings, renderingContext),
    [chartModel, settings, renderingContext],
  );
  const option = useMemo(
    () => ({
      ...getPieChartOption(
        chartModel,
        formatters,
        settings,
        renderingContext,
        sideLength,
        hoveredIndex,
      ),
      tooltip: getTooltipOption(chartModel, formatters, containerRef),
    }),
    [
      chartModel,
      formatters,
      settings,
      renderingContext,
      sideLength,
      hoveredIndex,
    ],
  );

  const valuesColorsCss = usePieChartValuesColorsClasses(chartModel);

  const handleInit = useCallback((chart: EChartsType) => {
    chartRef.current = chart;
  }, []);

  const handleResize = useCallback(
    (width: number, height: number) => setSideLength(Math.min(width, height)),
    [],
  );

  const eventHandlers = useChartEvents(props, chartRef, chartModel);

  const legendTitles = chartModel.slices
    .filter(s => s.data.includeInLegend)
    .map(s => {
      const label = s.data.name;

      // Hidden slices don't have a percentage
      if (s.data.normalizedPercentage === 0) {
        return label;
      }

      const percent =
        settings["pie.percent_visibility"] === "legend" ||
        settings["pie.percent_visibility"] === "both"
          ? formatters.formatPercent(s.data.normalizedPercentage, "legend")
          : undefined;

      return [label, percent];
    });

  const hiddenSlicesLegendIndices = chartModel.slices
    .filter(s => s.data.includeInLegend)
    .map((s, index) => (hiddenSlices.has(s.data.key) ? index : null))
    .filter(isNotNull);

  const legendColors = chartModel.slices
    .filter(s => s.data.includeInLegend)
    .map(s => s.data.color);

  const showLegend = settings["pie.show_legend"];

  const onHoverChange = (hoverData: any) =>
    props.onHoverChange(
      hoverData && {
        ...hoverData,
      },
    );

  const handleToggleSeriesVisibility = (
    event: MouseEvent,
    sliceIndex: number,
  ) => {
    const slice = chartModel.slices[sliceIndex];
    const willShowSlice = hiddenSlices.has(slice.data.key);
    const hasMoreVisibleSlices =
      chartModel.slices.length - hiddenSlices.size > 1;
    if (hasMoreVisibleSlices || willShowSlice) {
      toggleSliceVisibility(slice.data.key);
    }
  };

  useCloseTooltipOnScroll(chartRef);

  return (
    <ChartWithLegend
      legendTitles={legendTitles}
      legendHiddenIndices={hiddenSlicesLegendIndices}
      legendColors={legendColors}
      showLegend={showLegend}
      onHoverChange={onHoverChange}
      className={props.className}
      gridSize={props.gridSize}
      hovered={props.hovered}
      isDashboard={isDashboard}
      onToggleSeriesVisibility={handleToggleSeriesVisibility}
    >
      <ResponsiveEChartsRenderer
        ref={containerRef}
        option={option}
        onInit={handleInit}
        onResize={handleResize}
        eventHandlers={eventHandlers}
        // By default this is `true` for other charts, however for the pie chart
        // we need it to be `false`, otherwise echarts will bug out and be stuck
        // in emphasis state after hovering a slice
        notMerge={false}
      />
      {valuesColorsCss}
    </ChartWithLegend>
  );
}
