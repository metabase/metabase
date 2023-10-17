import { init } from "echarts";
import type { IsomorphicChartProps } from "metabase/static-viz/containers/StaticChart/types";
import { getCartesianChartModel } from "metabase/visualizations/echarts/cartesian/model";
import { getCartesianChartOption } from "metabase/visualizations/echarts/cartesian/option";
import { sanitizeSvgForBatik } from "metabase/static-viz/lib/svg";
import { computeStaticComboChartSettings } from "./settings";

const WIDTH = 540;
const HEIGHT = 360;

export const ComboChart = ({
  rawSeries,
  renderingContext,
}: IsomorphicChartProps) => {
  const chart = init(null, null, {
    renderer: "svg",
    ssr: true,
    width: WIDTH,
    height: HEIGHT,
  });

  const computedVisualizationSettings = computeStaticComboChartSettings(
    rawSeries,
    renderingContext,
  );

  const chartModel = getCartesianChartModel(
    rawSeries,
    computedVisualizationSettings,
  );

  const option = getCartesianChartOption(
    chartModel,
    computedVisualizationSettings,
    renderingContext,
  );

  chart.setOption(option);

  const chartSvg = sanitizeSvgForBatik(chart.renderToSVGString());

  return (
    <svg width={WIDTH} height={HEIGHT}>
      <g dangerouslySetInnerHTML={{ __html: chartSvg }}></g>
    </svg>
  );
};
