import { Group } from "@visx/group";
import { init } from "echarts/core";

import type { StaticChartProps } from "metabase/static-viz/components/StaticVisualization";
import { sanitizeSvgForBatik } from "metabase/static-viz/lib/svg";
import { registerEChartsModules } from "metabase/visualizations/echarts";
import {
  getBoxPlotLayoutModel,
  getBoxPlotModel,
  getBoxPlotOption,
} from "metabase/visualizations/echarts/boxplot";
import { getChartMeasurements } from "metabase/visualizations/echarts/cartesian/chart-measurements";
import { getLegendItems } from "metabase/visualizations/echarts/cartesian/model/legend";

import Watermark from "../../watermark.svg?component";
import { Legend } from "../Legend";
import { calculateLegendRows } from "../Legend/utils";

registerEChartsModules();

const WIDTH = 540;
const HEIGHT = 360;
const LEGEND_PADDING = 8;

export function BoxPlotChart({
  rawSeries,
  settings,
  renderingContext,
  width = WIDTH,
  height = HEIGHT,
  isStorybook = false,
  hasDevWatermark = false,
}: StaticChartProps) {
  const chartModel = getBoxPlotModel(rawSeries, settings);

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

  const chartMeasurements = getChartMeasurements(
    { ...chartModel, dataset: chartModel.boxDataset },
    settings,
    false,
    width,
    chartHeight,
    renderingContext,
  );

  const layoutModel = getBoxPlotLayoutModel({
    chartModel,
    chartMeasurements,
    settings,
    chartWidth: width,
    renderingContext,
  });

  const option = getBoxPlotOption(
    chartModel,
    layoutModel,
    null,
    [],
    settings,
    false,
    renderingContext,
  );
  chart.setOption(option);

  const chartSvg = sanitizeSvgForBatik(chart.renderToSVGString(), isStorybook);

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
    </svg>
  );
}
