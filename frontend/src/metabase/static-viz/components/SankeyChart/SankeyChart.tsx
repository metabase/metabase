import { init } from "echarts/core";

import type { StaticChartProps } from "metabase/static-viz/components/StaticVisualization";
import { sanitizeSvgForBatik } from "metabase/static-viz/lib/svg";
import { registerEChartsModules } from "metabase/viz-core/echarts";
import { getSankeyLayout } from "metabase/viz-core/echarts/graph/sankey/layout";
import { getSankeyChartModel } from "metabase/viz-core/echarts/graph/sankey/model";
import { getSankeyChartOption } from "metabase/viz-core/echarts/graph/sankey/option";

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
  chart.dispose();

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
