import { init } from "echarts/core";

import type { StaticChartProps } from "metabase/static-viz/components/StaticVisualization";
import { readAllPointsOutOfRange } from "metabase/static-viz/lib/data-visibility";
import { sanitizeSvgForBatik } from "metabase/static-viz/lib/svg";
import {
  getChartLayout,
  getWaterfallChartModel,
  getWaterfallChartOption,
  registerEChartsModules,
} from "metabase/viz-core";

import Watermark from "../../watermark.svg?component";
import { DataOutOfRangeOverlay } from "../DataOutOfRangeOverlay/DataOutOfRangeOverlay";

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
  const chartLayout = getChartLayout(
    chartModel,
    settings,
    false,
    width,
    height,
    renderingContext,
  );
  const option = getWaterfallChartOption(
    chartModel,
    width,
    chartLayout,
    false,
    null,
    [],
    settings,
    false,
    renderingContext,
  );

  const chart = init(null, null, { renderer: "svg", ssr: true, width, height });
  chart.setOption(option);
  const chartSvg = sanitizeSvgForBatik(chart.renderToSVGString(), isStorybook);
  const allPointsOutOfRange = readAllPointsOutOfRange(chart);
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
      {allPointsOutOfRange && (
        <DataOutOfRangeOverlay
          width={width}
          height={height}
          renderingContext={renderingContext}
        />
      )}
    </svg>
  );
}
