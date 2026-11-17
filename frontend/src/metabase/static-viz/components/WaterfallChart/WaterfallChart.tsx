import { init } from "echarts/core";

import type { StaticChartProps } from "metabase/static-viz/components/StaticVisualization";
import { readAllPointsOutOfRange } from "metabase/static-viz/lib/data-visibility";
import { withCartesianChartSize } from "metabase/static-viz/lib/rendering-context";
import { sanitizeSvgForBatik } from "metabase/static-viz/lib/svg";
import { STATIC_CARTESIAN_CHART_SIZE } from "metabase/static-viz/lib/utils";
import {
  getChartLayout,
  getSizeAdjustedSettings,
  getWaterfallChartModel,
  getWaterfallChartOption,
  registerEChartsModules,
} from "metabase/viz-core";

import Watermark from "../../watermark.svg?component";
import { DataOutOfRangeOverlay } from "../DataOutOfRangeOverlay/DataOutOfRangeOverlay";

registerEChartsModules();

export function WaterfallChart({
  rawSeries,
  settings: originalSettings,
  renderingContext: originalRenderingContext,
  width = STATIC_CARTESIAN_CHART_SIZE.width,
  height = STATIC_CARTESIAN_CHART_SIZE.height,
  isStorybook = false,
  hasDevWatermark = false,
  gridSize,
}: StaticChartProps) {
  const renderingContext = withCartesianChartSize(originalRenderingContext, {
    width,
    height,
  });
  const settings = getSizeAdjustedSettings({
    settings: originalSettings,
    width,
    height,
    gridSize,
  });
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
