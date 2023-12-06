import { init } from "echarts";
import type { IsomorphicStaticChartProps } from "metabase/static-viz/containers/IsomorphicStaticChart/types";
import { sanitizeSvgForBatik } from "metabase/static-viz/lib/svg";

import { getPieChartModel } from "metabase/visualizations/echarts/pie/model";
import { getPieChartOption } from "metabase/visualizations/echarts/pie/option";
import { computeStaticPieChartSettings } from "./setttings";

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
  const option = getPieChartOption(
    chartModel,
    computedVizSettings,
    renderingContext,
  );

  const chart = init(null, null, {
    renderer: "svg",
    ssr: true,
    width: WIDTH,
    height: HEIGHT,
  });

  chart.setOption(option);

  const svg = sanitizeSvgForBatik(chart.renderToSVGString());

  return (
    <svg width={WIDTH} height={HEIGHT}>
      <g dangerouslySetInnerHTML={{ __html: svg }}></g>
    </svg>
  );
}
