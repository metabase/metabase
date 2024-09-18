import { init } from "echarts/core";

import type { StaticChartProps } from "metabase/static-viz/components/StaticVisualization";
import { sanitizeSvgForBatik } from "metabase/static-viz/lib/svg";
import { registerEChartsModules } from "metabase/visualizations/echarts";
import { buildTreemapOption } from "metabase/visualizations/visualizations/Treemap/option";

import { computeTreemapChartSettings } from "./settings";

const WIDTH = 540;
const HEIGHT = 360;

registerEChartsModules();

export const TreemapChart = ({
  rawSeries,
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

  const computedVisualizationSettings = computeTreemapChartSettings(
    rawSeries,
    renderingContext,
  );

  const option = buildTreemapOption(rawSeries, computedVisualizationSettings);

  chart.setOption(option);

  const chartSvg = sanitizeSvgForBatik(chart.renderToSVGString(), isStorybook);

  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={width} height={height}>
      <g dangerouslySetInnerHTML={{ __html: chartSvg }}></g>
    </svg>
  );
};
