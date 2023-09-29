import { init } from "echarts";
import { getCartesianChartModel } from "metabase/visualizations/echarts/cartesian/model";
import { getCartesianChartOption } from "metabase/visualizations/echarts/cartesian/option";
import { sanitizeSvgForBatik } from "metabase/static-viz/lib/svg";
import type { IsomorphicStaticChartProps } from "metabase/static-viz/containers/IsomorphicStaticChart/types";
import { computeStaticComboChartSettings } from "./settings";

const WIDTH = 540;
const HEIGHT = 360;

export const ComboChart = ({
  rawSeries,
  dashcardSettings,
  renderingContext,
  width = WIDTH,
  height = HEIGHT,
}: IsomorphicStaticChartProps) => {
  const chart = init(null, null, {
    renderer: "svg",
    ssr: true,
    width,
    height,
  });

  const computedVisualizationSettings = computeStaticComboChartSettings(
    rawSeries,
    dashcardSettings,
    renderingContext,
  );

  const chartModel = getCartesianChartModel(
    rawSeries,
    computedVisualizationSettings,
    renderingContext,
  );

  const option = getCartesianChartOption(
    chartModel,
    computedVisualizationSettings,
    renderingContext,
  );

  chart.setOption(option);

  const chartSvg = sanitizeSvgForBatik(chart.renderToSVGString());

  return (
    <svg width={width} height={height}>
      <g dangerouslySetInnerHTML={{ __html: chartSvg }}></g>
    </svg>
  );
};
