import { init } from "echarts/core";

import type { StaticChartProps } from "metabase/static-viz/components/StaticVisualization";
import { sanitizeSvgForBatik } from "metabase/static-viz/lib/svg";
import { registerEChartsModules } from "metabase/visualizations/echarts";
import { getChartMeasurements } from "metabase/visualizations/echarts/cartesian/chart-measurements";
import { getWaterfallChartModel } from "metabase/visualizations/echarts/cartesian/waterfall/model";
import { getWaterfallChartOption } from "metabase/visualizations/echarts/cartesian/waterfall/option";

import { computeStaticWaterfallChartSettings } from "./settings";

registerEChartsModules();

const WIDTH = 540;
const HEIGHT = 360;

export function WaterfallChart({
  rawSeries,
  dashcardSettings,
  renderingContext,
  width = WIDTH,
  height = HEIGHT,
  isStorybook = false,
}: StaticChartProps) {
  const computedVisualizationSettings = computeStaticWaterfallChartSettings(
    rawSeries,
    dashcardSettings,
    renderingContext,
  );
  const chartModel = getWaterfallChartModel(
    rawSeries,
    computedVisualizationSettings,
    renderingContext,
  );
  const chartMeasurements = getChartMeasurements(
    chartModel,
    computedVisualizationSettings,
    false,
    width,
    height,
    renderingContext,
  );
  const option = getWaterfallChartOption(
    chartModel,
    WIDTH,
    chartMeasurements,
    null,
    [],
    computedVisualizationSettings,
    false,
    renderingContext,
  );

  const chart = init(null, null, { renderer: "svg", ssr: true, width, height });
  chart.setOption(option);
  const chartSvg = sanitizeSvgForBatik(chart.renderToSVGString(), isStorybook);

  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={width} height={height}>
      <g dangerouslySetInnerHTML={{ __html: chartSvg }}></g>
    </svg>
  );
}
