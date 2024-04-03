import { Group } from "@visx/group";
import { init } from "echarts";

import type { IsomorphicStaticChartProps } from "metabase/static-viz/containers/IsomorphicStaticChart/types";
import { sanitizeSvgForBatik } from "metabase/static-viz/lib/svg";
import { getChartMeasurements } from "metabase/visualizations/echarts/cartesian/chart-measurements";
import { getCartesianChartModel } from "metabase/visualizations/echarts/cartesian/model";
import { getLegendItems } from "metabase/visualizations/echarts/cartesian/model/legend";
import { getCartesianChartOption } from "metabase/visualizations/echarts/cartesian/option";

import { computeStaticComboChartSettings } from "../ComboChart/settings";
import { Legend } from "../Legend";
import { calculateLegendRows } from "../Legend/utils";

const WIDTH = 540;
const HEIGHT = 360;
const LEGEND_PADDING = 8;

export function ScatterPlot({
  rawSeries,
  dashcardSettings,
  renderingContext,
  width = WIDTH,
  height = HEIGHT,
  isStorybook = false,
}: IsomorphicStaticChartProps) {
  const chart = init(null, null, { renderer: "svg", ssr: true, width, height });

  const computedVisualizationSettings = computeStaticComboChartSettings(
    rawSeries,
    dashcardSettings,
    renderingContext,
  );

  const chartModel = getCartesianChartModel(
    rawSeries,
    computedVisualizationSettings,
    renderingContext,
  );

  const legendItems = getLegendItems(chartModel);
  const { height: legendHeight, items: legendLayoutItems } =
    calculateLegendRows({
      items: legendItems,
      width,
      horizontalPadding: LEGEND_PADDING,
      verticalPadding: LEGEND_PADDING,
    });

  const chartMeasurements = getChartMeasurements(
    chartModel,
    computedVisualizationSettings,
    false,
    width,
    height,
    renderingContext,
  );

  const option = getCartesianChartOption(
    chartModel,
    chartMeasurements,
    null,
    [],
    computedVisualizationSettings,
    width,
    false,
    renderingContext,
  );
  chart.setOption(option);

  const chartSvg = sanitizeSvgForBatik(chart.renderToSVGString(), isStorybook);

  return (
    <svg width={width} height={height + legendHeight}>
      <Legend items={legendLayoutItems} />
      <Group top={legendHeight}>
        <g dangerouslySetInnerHTML={{ __html: chartSvg }}></g>
      </Group>
    </svg>
  );
}
