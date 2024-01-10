import { init } from "echarts";

import type { IsomorphicStaticChartProps } from "metabase/static-viz/containers/IsomorphicStaticChart/types";
import { sanitizeSvgForBatik } from "metabase/static-viz/lib/svg";
import { getWaterfallOption } from "metabase/visualizations/echarts/cartesian/waterfall/option";
import { getWaterfallChartModel } from "metabase/visualizations/echarts/cartesian/waterfall/model";

import { computeStaticComboChartSettings } from "../ComboChart/settings";

const WIDTH = 540;
const HEIGHT = 360;

export function WaterfallChart({
  rawSeries,
  dashcardSettings,
  renderingContext,
  width = WIDTH,
  height = HEIGHT,
}: IsomorphicStaticChartProps) {
  const computedVisualizationSettings = computeStaticComboChartSettings(
    rawSeries,
    dashcardSettings,
    renderingContext,
  );
  const chartModel = getWaterfallChartModel(
    rawSeries,
    computedVisualizationSettings,
    renderingContext,
  );
  const option = getWaterfallOption(
    chartModel,
    null,
    [],
    computedVisualizationSettings,
    false,
    renderingContext,
  );

  const chart = init(null, null, { renderer: "svg", ssr: true, width, height });
  chart.setOption(option);
  const chartSvg = sanitizeSvgForBatik(chart.renderToSVGString());

  return (
    <svg width={width} height={height}>
      <g dangerouslySetInnerHTML={{ __html: chartSvg }}></g>
    </svg>
  );
}
