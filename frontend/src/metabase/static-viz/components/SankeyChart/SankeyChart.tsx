import { init } from "echarts/core";

import type { StaticChartProps } from "metabase/static-viz/components/StaticVisualization";
import { sanitizeSvgForBatik } from "metabase/static-viz/lib/svg";
import { registerEChartsModules } from "metabase/visualizations/echarts";
import { getSankeyLayout } from "metabase/visualizations/echarts/graph/layout";
import { getSankeyChartModel } from "metabase/visualizations/echarts/graph/model";
import { getSankeyChartOption } from "metabase/visualizations/echarts/graph/sankey/option";

import { computeSankeyChartSettings } from "./settings";

const WIDTH = 540;
const HEIGHT = 360;

registerEChartsModules();

export const SankeyChart = ({
  rawSeries,
  dashcardSettings,
  renderingContext,
  width = WIDTH,
  height = HEIGHT,
  isStorybook = false,
}: StaticChartProps) => {
  const chart = init(null, null, {
    renderer: "svg",
    ssr: true,
    width,
    height,
  });

  const computedVisualizationSettings = computeSankeyChartSettings(
    rawSeries,
    dashcardSettings,
    renderingContext,
  );

  const chartModel = getSankeyChartModel(
    rawSeries,
    computedVisualizationSettings,
    renderingContext,
  );

  const layout = getSankeyLayout(chartModel, renderingContext);

  const option = getSankeyChartOption(chartModel, layout, renderingContext);

  chart.setOption(option);

  const chartSvg = sanitizeSvgForBatik(chart.renderToSVGString(), isStorybook);

  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={width} height={height}>
      <g dangerouslySetInnerHTML={{ __html: chartSvg }}></g>
    </svg>
  );
};
