import { init } from "echarts/core";

import type { StaticChartProps } from "metabase/static-viz/components/StaticVisualization";
import { sanitizeSvgForBatik } from "metabase/static-viz/lib/svg";
import { registerEChartsModules } from "metabase/visualizations/echarts";
import { getSankeyLayout } from "metabase/visualizations/echarts/graph/sankey/layout";
import { getSankeyChartModel } from "metabase/visualizations/echarts/graph/sankey/model";
import { getSankeyChartOption } from "metabase/visualizations/echarts/graph/sankey/option";

import Watermark from "../../watermark.svg?component";

const WIDTH = 540;
const HEIGHT = 360;

registerEChartsModules();

export const SankeyChart = ({
  rawSeries,
  settings,
  renderingContext,
  width = WIDTH,
  height = HEIGHT,
  isStorybook = false,
  hasDevWatermark = false,
}: StaticChartProps) => {
  const chart = init(null, null, {
    renderer: "svg",
    ssr: true,
    width,
    height,
  });

  const chartModel = getSankeyChartModel(rawSeries, settings);
  const layout = getSankeyLayout(
    chartModel,
    settings,
    width,
    height,
    renderingContext,
  );
  const option = getSankeyChartOption(
    chartModel,
    layout,
    settings,
    renderingContext,
  );

  chart.setOption(option);

  const chartSvg = sanitizeSvgForBatik(chart.renderToSVGString(), isStorybook);

  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={width} height={height}>
      <g dangerouslySetInnerHTML={{ __html: chartSvg }}></g>
      {hasDevWatermark && (
        <Watermark
          x="0"
          y="0"
          height={height}
          width={width}
          preserveAspectRatio="xMinYMin slice"
          fill={renderingContext.getColor("text-secondary")}
          opacity={0.2}
        />
      )}
    </svg>
  );
};
