import type { EChartsType } from "echarts/core";
import { useCallback, useMemo, useRef, useState } from "react";

import { getPieChartFormatters } from "metabase/visualizations/echarts/pie/format";
import { getPieChartModel } from "metabase/visualizations/echarts/pie/model";
import { getPieChartOption } from "metabase/visualizations/echarts/pie/option";
import { useBrowserRenderingContext } from "metabase/visualizations/hooks/use-browser-rendering-context";
import type { VisualizationProps } from "metabase/visualizations/types";

import { ChartRenderer } from "./PieChart.styled";
import { PIE_CHART_DEFINITION } from "./chart-definition";
import { useChartEvents } from "./use-chart-events";

Object.assign(PieChart, PIE_CHART_DEFINITION);

export function PieChart(props: VisualizationProps) {
  const { fontFamily, rawSeries, settings } = props;

  const chartRef = useRef<EChartsType>();
  const [sideLength, setSideLength] = useState(0);

  const renderingContext = useBrowserRenderingContext({
    fontFamily,
  });
  const chartModel = useMemo(
    () => getPieChartModel(rawSeries, settings, renderingContext),
    [rawSeries, settings, renderingContext],
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
      ),
    [chartModel, formatters, settings, renderingContext, sideLength],
  );

  const handleInit = useCallback((chart: EChartsType) => {
    chartRef.current = chart;
  }, []);

  const handleResize = useCallback(
    (width: number, height: number) => setSideLength(Math.min(width, height)),
    [],
  );

  const eventHandlers = useChartEvents(props, chartRef, chartModel, formatters);

  return (
    <ChartRenderer
      option={option}
      width={"auto"}
      height={"auto"}
      onInit={handleInit}
      onResize={handleResize}
      eventHandlers={eventHandlers}
      style={null}
    />
  );
}
