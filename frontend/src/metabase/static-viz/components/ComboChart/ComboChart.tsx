import { init } from "echarts";
import { Group } from "@visx/group";
import { getCartesianChartModel } from "metabase/visualizations/echarts/cartesian/model";
import { getCartesianChartOption } from "metabase/visualizations/echarts/cartesian/option";
import { sanitizeSvgForBatik } from "metabase/static-viz/lib/svg";
import type { IsomorphicStaticChartProps } from "metabase/static-viz/containers/IsomorphicStaticChart/types";
import { getLegendItems } from "metabase/visualizations/echarts/cartesian/model/legend";
import { calculateLegendRows } from "../Legend/utils";
import { Legend } from "../Legend";
import { computeStaticComboChartSettings } from "./settings";

const WIDTH = 540;
const HEIGHT = 360;
const LEGEND_PADDING = 8;

export const ComboChart = ({
  rawSeries,
  dashcardSettings,
  renderingContext,
  width = WIDTH,
  height = HEIGHT,
}: IsomorphicStaticChartProps) => {
  const chart = init(null, null, {
    renderer: "svg",
    ssr: true,
    width,
    height,
  });

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
    calculateLegendRows(legendItems, width, LEGEND_PADDING, LEGEND_PADDING);

  const option = getCartesianChartOption(
    chartModel,
    null,
    [],
    computedVisualizationSettings,
    WIDTH,
    false,
    renderingContext,
  );

  chart.setOption(option);

  const chartSvg = sanitizeSvgForBatik(chart.renderToSVGString());

  return (
    <svg width={width} height={height + legendHeight}>
      <Legend items={legendLayoutItems} />
      <Group top={legendHeight}>
        <g dangerouslySetInnerHTML={{ __html: chartSvg }}></g>
      </Group>
    </svg>
  );
};
