import { Group } from "@visx/group";
import { init } from "echarts";

import { sanitizeSvgForBatik } from "metabase/static-viz/lib/svg";
import { DIMENSIONS } from "metabase/visualizations/echarts/pie/constants";
import { getPieChartFormatters } from "metabase/visualizations/echarts/pie/format";
import { getPieChartModel } from "metabase/visualizations/echarts/pie/model";
import { getPieChartOption } from "metabase/visualizations/echarts/pie/option";

import type { StaticChartProps } from "../StaticVisualization";

import { getPieChartLegend } from "./legend";
import { computeStaticPieChartSettings } from "./settings";

export function PieChart({
  rawSeries,
  dashcardSettings,
  renderingContext,
  isStorybook,
}: StaticChartProps) {
  const computedVizSettings = computeStaticPieChartSettings(
    rawSeries,
    dashcardSettings,
  );
  const chartModel = getPieChartModel(
    rawSeries,
    computedVizSettings,
    renderingContext,
  );
  const formatters = getPieChartFormatters(
    chartModel,
    computedVizSettings,
    renderingContext,
  );
  const option = getPieChartOption(
    chartModel,
    formatters,
    computedVizSettings,
    renderingContext,
    DIMENSIONS.maxSideLength,
  );
  const { legendHeight, Legend } = getPieChartLegend(
    chartModel,
    formatters,
    computedVizSettings,
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
