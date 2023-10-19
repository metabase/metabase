import { init } from "echarts";
import { Group } from "@visx/group";

import type { IsomorphicStaticChartProps } from "metabase/static-viz/containers/IsomorphicStaticChart/types";
import { sanitizeSvgForBatik } from "metabase/static-viz/lib/svg";

import { getPieChartModel } from "metabase/visualizations/echarts/pie/model";
import { getPieChartOption } from "metabase/visualizations/echarts/pie/option";

import { getPieChartFormatters } from "metabase/visualizations/echarts/pie/format";
import { calculateLegendRows } from "../Legend/utils";
import { Legend } from "../Legend";
import { computeStaticPieChartSettings } from "./setttings";

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

  const legendRows = calculateLegendRows(
    chartModel.slices.map(s => ({
      name: `${s.key} - ${formatters.formatPercent(s.normalizedPercentage)}`,
      color: s.color,
    })),
    WIDTH,
    24,
    18,
    400,
  );
  if (!legendRows) {
    throw Error("Error calculating legend rows");
  }
  const { height: legendHeight, items } = legendRows;

  const chart = init(null, null, {
    renderer: "svg",
    ssr: true,
    width: WIDTH,
    height: HEIGHT,
  });

  chart.setOption(option);

  const svg = sanitizeSvgForBatik(chart.renderToSVGString());

  return (
    <svg width={WIDTH} height={PADDING_TOP + HEIGHT + legendHeight}>
      <Group top={PADDING_TOP}>
        <Legend fontSize={18} fontWeight={400} items={items} />
      </Group>
      <Group
        top={PADDING_TOP + legendHeight}
        dangerouslySetInnerHTML={{ __html: svg }}
      ></Group>
    </svg>
  );
}
