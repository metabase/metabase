import { init } from "echarts/core";

import type { StaticChartProps } from "metabase/static-viz/components/StaticVisualization";
import { sanitizeSvgForBatik } from "metabase/static-viz/lib/svg";
import { registerEChartsModules } from "metabase/visualizations/echarts";
import { getChartMeasurements } from "metabase/visualizations/echarts/cartesian/chart-measurements";
import { getWaterfallChartModel } from "metabase/visualizations/echarts/cartesian/waterfall/model";
import { getWaterfallChartOption } from "metabase/visualizations/echarts/cartesian/waterfall/option";

import Watermark from "../../watermark.svg?component";

registerEChartsModules();

const WIDTH = 540;
const HEIGHT = 360;

export function WaterfallChart({
  rawSeries,
  settings,
  renderingContext,
  width = WIDTH,
  height = HEIGHT,
  isStorybook = false,
  hasDevWatermark = false,
}: StaticChartProps) {
  const chartModel = getWaterfallChartModel(
    rawSeries,
    settings,
    [],
    renderingContext,
  );
  const chartMeasurements = getChartMeasurements(
    chartModel,
    settings,
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
    settings,
    false,
    renderingContext,
  );

  const chart = init(null, null, { renderer: "svg", ssr: true, width, height });
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
}
