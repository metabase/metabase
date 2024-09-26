import { Group } from "@visx/group";
import { init } from "echarts";

import { sanitizeSvgForBatik } from "metabase/static-viz/lib/svg";
import { DIMENSIONS } from "metabase/visualizations/echarts/pie/constants";
import { getPieChartFormatters } from "metabase/visualizations/echarts/pie/format";
import { getPieChartModel } from "metabase/visualizations/echarts/pie/model";
import { getPieChartOption } from "metabase/visualizations/echarts/pie/option";

import type { StaticChartProps } from "../StaticVisualization";

import { getPieChartLegend } from "./legend";

export function PieChart({
  rawSeries,
  renderingContext,
  settings,
  isStorybook,
}: StaticChartProps) {
  const chartModel = getPieChartModel(
    rawSeries,
    settings,
    [],
    renderingContext,
  );
  const formatters = getPieChartFormatters(chartModel, settings);
  const option = getPieChartOption(
    chartModel,
    formatters,
    settings,
    renderingContext,
    DIMENSIONS.maxSideLength,
  );
  const { legendHeight, Legend } = getPieChartLegend(
    chartModel,
    formatters,
    settings,
  );

  const chart = init(null, null, {
    renderer: "svg",
    ssr: true,
    width: DIMENSIONS.maxSideLength,
    height: DIMENSIONS.maxSideLength,
  });
  chart.setOption(option);
  const chartSvg = sanitizeSvgForBatik(
    chart.renderToSVGString(),
    isStorybook ?? false,
  );

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={DIMENSIONS.maxSideLength}
      height={
        DIMENSIONS.maxSideLength + DIMENSIONS.padding.legend + legendHeight
      }
    >
      <Group dangerouslySetInnerHTML={{ __html: chartSvg }}></Group>
      <Legend />
    </svg>
  );
}
