import { Group } from "@visx/group";
import { init } from "echarts/core";

import type { StaticChartProps } from "metabase/static-viz/components/StaticVisualization";
import { readAllPointsOutOfRange } from "metabase/static-viz/lib/data-visibility";
import { withCartesianChartSize } from "metabase/static-viz/lib/rendering-context";
import { sanitizeSvgForBatik } from "metabase/static-viz/lib/svg";
import { STATIC_CARTESIAN_CHART_SIZE } from "metabase/static-viz/lib/utils";
import {
  getBoxPlotLayoutModel,
  getBoxPlotModel,
  getBoxPlotOption,
  getChartLayout,
  getLegendItems,
  getSizeAdjustedSettings,
  registerEChartsModules,
} from "metabase/viz-core";

import Watermark from "../../watermark.svg?component";
import { DataOutOfRangeOverlay } from "../DataOutOfRangeOverlay/DataOutOfRangeOverlay";
import { Legend } from "../Legend";
import { calculateLegendRows } from "../Legend/utils";

registerEChartsModules();

const LEGEND_PADDING = 8;

export function BoxPlotChart({
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
  const chartModel = getBoxPlotModel(
    rawSeries,
    settings,
    [],
    undefined,
    renderingContext.cartesianSize,
  );

  const legendItems = getLegendItems(chartModel.seriesModels);
  const isReversed = settings["legend.is_reversed"];
  const { height: legendHeight, items: legendLayoutItems } =
    calculateLegendRows({
      items: legendItems,
      width,
      horizontalPadding: LEGEND_PADDING,
      verticalPadding: LEGEND_PADDING,
      isReversed,
    });

  const chartHeight = height - legendHeight;
  const chart = init(null, null, {
    renderer: "svg",
    ssr: true,
    width,
    height: chartHeight,
  });

  const cartesianLayout = getChartLayout(
    { ...chartModel, dataset: chartModel.boxDataset },
    settings,
    false,
    width,
    chartHeight,
    renderingContext,
  );

  const layoutModel = getBoxPlotLayoutModel({
    chartModel,
    cartesianLayout,
    settings,
    chartWidth: width,
    renderingContext,
  });

  const option = getBoxPlotOption(
    chartModel,
    layoutModel,
    settings,
    false,
    renderingContext,
  );
  chart.setOption(option);

  const chartSvg = sanitizeSvgForBatik(chart.renderToSVGString(), isStorybook);
  const allPointsOutOfRange = readAllPointsOutOfRange(chart);
  chart.dispose();

  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={width} height={height}>
      <Legend items={legendLayoutItems} />
      <Group top={legendHeight}>
        <g dangerouslySetInnerHTML={{ __html: chartSvg }}></g>
      </Group>
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
