import type { EChartsType } from "echarts/core";
import { useCallback, useMemo, useRef, useState } from "react";

import ChartWithLegend from "metabase/visualizations/components/ChartWithLegend";
import { getPieChartFormatters } from "metabase/visualizations/echarts/pie/format";
import { getPieChartModel } from "metabase/visualizations/echarts/pie/model";
import { getPieChartOption } from "metabase/visualizations/echarts/pie/option";
import { useBrowserRenderingContext } from "metabase/visualizations/hooks/use-browser-rendering-context";
import type { VisualizationProps } from "metabase/visualizations/types";

import { ChartRenderer } from "./PieChart.styled";
import { PIE_CHART_DEFINITION } from "./chart-definition";
import { getTooltipModel, useChartEvents } from "./use-chart-events";

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

  const chartRef = useRef<EChartsType>();
  const [sideLength, setSideLength] = useState(0);

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
    () => getPieChartModel(rawSeries, settings, renderingContext, showWarning),
    [rawSeries, settings, renderingContext, showWarning],
  );
  const formatters = useMemo(
    () => getPieChartFormatters(chartModel, settings, renderingContext),
    [chartModel, settings, renderingContext],
  );
  const option = useMemo(
    () =>
      getPieChartOption(
        chartModel,
        formatters,
        settings,
        renderingContext,
        sideLength,
        hoveredIndex,
      ),
    [
      chartModel,
      formatters,
      settings,
      renderingContext,
      sideLength,
      hoveredIndex,
    ],
  );

  const handleInit = useCallback((chart: EChartsType) => {
    chartRef.current = chart;
  }, []);

  const handleResize = useCallback(
    (width: number, height: number) => setSideLength(Math.min(width, height)),
    [],
  );

  const eventHandlers = useChartEvents(props, chartRef, chartModel, formatters);

  const legendTitles = chartModel.slices
    .filter(s => s.data.includeInLegend)
    .map(s => {
      const label = s.data.isOther
        ? s.data.key
        : formatters.formatDimension(s.data.key);

      const percent =
        settings["pie.percent_visibility"] === "legend" ||
        settings["pie.percent_visibility"] === "both"
          ? formatters.formatPercent(s.data.normalizedPercentage, "legend")
          : undefined;

      return [label, percent];
    });

  const legendColors = chartModel.slices
    .filter(s => s.data.includeInLegend)
    .map(s => s.data.color);

  const showLegend = settings["pie.show_legend"];

  const onHoverChange = (hoverData: any) =>
    props.onHoverChange(
      hoverData && {
        ...hoverData,
        stackedTooltipModel: getTooltipModel(
          hoverData.index,
          chartModel,
          formatters,
        ),
      },
    );

  return (
    // @ts-expect-error - `ChartWithLegend` has bad types due to it being in js
    // and due to using a HoC
    <ChartWithLegend
      legendTitles={legendTitles}
      legendColors={legendColors}
      showLegend={showLegend}
      onHoverChange={onHoverChange}
      className={props.className}
      gridSize={props.gridSize}
      hovered={props.hovered}
      isDashboard={isDashboard}
    >
      <ChartRenderer
        option={option}
        width={"auto"}
        height={"auto"}
        onInit={handleInit}
        onResize={handleResize}
        eventHandlers={eventHandlers}
        // By default this is `true` for other charts, however for the pie chart
        // we need it to be `false`, otherwise echarts will bug out and be stuck
        // in emphasis state after hovering a slice
        notMerge={false}
        style={null}
      />
    </ChartWithLegend>
  );
}
