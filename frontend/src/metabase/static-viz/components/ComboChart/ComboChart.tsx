import { Group } from "@visx/group";
import { init } from "echarts/core";

import type { StaticChartProps } from "metabase/static-viz/components/StaticVisualization";
import { sanitizeSvgForBatik } from "metabase/static-viz/lib/svg";
import { registerEChartsModules } from "metabase/visualizations/echarts";
import { getChartMeasurements } from "metabase/visualizations/echarts/cartesian/chart-measurements";
import { getCartesianChartModel } from "metabase/visualizations/echarts/cartesian/model";
import { getLegendItems } from "metabase/visualizations/echarts/cartesian/model/legend";
import { getCartesianChartOption } from "metabase/visualizations/echarts/cartesian/option";

import { Legend } from "../Legend";
import { calculateLegendRows } from "../Legend/utils";

const WIDTH = 540;
const HEIGHT = 360;
const LEGEND_PADDING = 8;

registerEChartsModules();

export const ComboChart = ({
  rawSeries,
  settings,
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

  const chartModel = getCartesianChartModel(
    rawSeries,
    settings,
    [],
    renderingContext,
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

  const chartMeasurements = getChartMeasurements(
    chartModel,
    settings,
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
    settings,
    WIDTH,
    false,
    renderingContext,
  );

  chart.setOption(option);

  const chartSvg = sanitizeSvgForBatik(chart.renderToSVGString(), isStorybook);

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={width}
      height={height + legendHeight}
    >
      <Legend items={legendLayoutItems} />
      <Group top={legendHeight}>
        <g dangerouslySetInnerHTML={{ __html: chartSvg }}></g>
      </Group>
    </svg>
  );
};
