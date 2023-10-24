import { init } from "echarts";
import { Group } from "@visx/group";

import type { IsomorphicStaticChartProps } from "metabase/static-viz/containers/IsomorphicStaticChart/types";
import { sanitizeSvgForBatik } from "metabase/static-viz/lib/svg";
import { getPieChartModel } from "metabase/visualizations/echarts/pie/model";
import { getPieChartOption } from "metabase/visualizations/echarts/pie/option";
import { getPieChartFormatters } from "metabase/visualizations/echarts/pie/format";
import { DIMENSIONS } from "metabase/visualizations/echarts/pie/constants";

import { computeStaticPieChartSettings } from "./setttings";
import { getPieChartLegend } from "./legend";

export function PieChart({
  rawSeries,
  dashcardSettings,
  renderingContext,
}: IsomorphicStaticChartProps) {
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
  );
  const { legendHeight, Legend } = getPieChartLegend(
    chartModel,
    formatters,
    computedVizSettings,
    DIMENSIONS.sideLen,
    DIMENSIONS.paddingTop,
  );

  const chart = init(null, null, {
    renderer: "svg",
    ssr: true,
    width: DIMENSIONS.sideLen,
    height: DIMENSIONS.sideLen,
  });

  chart.setOption(option);

  const chartSvg = sanitizeSvgForBatik(chart.renderToSVGString());

  return (
    <svg
      width={DIMENSIONS.sideLen}
      height={DIMENSIONS.sideLen + DIMENSIONS.paddingTop + legendHeight}
    >
      <Legend />
      <Group
        top={DIMENSIONS.paddingTop + legendHeight}
        dangerouslySetInnerHTML={{ __html: chartSvg }}
      ></Group>
    </svg>
  );
}
