import { useState } from "react";

import { getPieChartFormatters } from "metabase/visualizations/echarts/pie/format";
import { getPieChartModel } from "metabase/visualizations/echarts/pie/model";
import { getPieChartOption } from "metabase/visualizations/echarts/pie/option";
import { useBrowserRenderingContext } from "metabase/visualizations/hooks/use-browser-rendering-context";
import type { VisualizationProps } from "metabase/visualizations/types";

import { ChartRenderer } from "./PieChart.styled";
import { PIE_CHART_DEFINITION } from "./chart-definition";

Object.assign(PieChart, PIE_CHART_DEFINITION);

export function PieChart(props: VisualizationProps) {
  const [sideLength, setSideLength] = useState(0);

  const renderingContext = useBrowserRenderingContext({
    fontFamily: props.fontFamily,
  });
  const chartModel = getPieChartModel(
    props.rawSeries,
    props.settings,
    renderingContext,
  );
  const formatters = getPieChartFormatters(
    chartModel,
    props.settings,
    renderingContext,
  );
  const option = getPieChartOption(
    chartModel,
    formatters,
    props.settings,
    renderingContext,
    sideLength,
  );

  return (
    <ChartRenderer
      option={option}
      width={"auto"}
      height={"auto"}
      onResize={(width, height) => setSideLength(Math.min(width, height))}
      style={null}
    />
  );
}
