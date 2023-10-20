import { init } from "echarts";
import { Group } from "@visx/group";

import type { IsomorphicStaticChartProps } from "metabase/static-viz/containers/IsomorphicStaticChart/types";
import { sanitizeSvgForBatik } from "metabase/static-viz/lib/svg";
import { getPieChartModel } from "metabase/visualizations/echarts/pie/model";
import { getPieChartOption } from "metabase/visualizations/echarts/pie/option";
import { getPieChartFormatters } from "metabase/visualizations/echarts/pie/format";

import { computeStaticPieChartSettings } from "./setttings";
import { getPieChartLegend } from "./legend";

const PADDING_TOP = 16; // TODO confirm with design
const WIDTH = 540;
const HEIGHT = 360;

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
    WIDTH,
    PADDING_TOP,
  );

  const chart = init(null, null, {
    renderer: "svg",
    ssr: true,
    width: WIDTH,
    height: HEIGHT,
  });

  chart.setOption(option);

  const chartSvg = sanitizeSvgForBatik(chart.renderToSVGString());

  return (
    <svg width={WIDTH} height={PADDING_TOP + HEIGHT + legendHeight}>
      <Legend />
      <Group
        top={PADDING_TOP + legendHeight}
        dangerouslySetInnerHTML={{ __html: chartSvg }}
      ></Group>
    </svg>
  );
}
