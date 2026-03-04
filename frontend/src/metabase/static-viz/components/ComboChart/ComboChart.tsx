import { Group } from "@visx/group";
import { init } from "echarts/core";
import { t } from "ttag";

import type { StaticChartProps } from "metabase/static-viz/components/StaticVisualization";
import { sanitizeSvgForBatik } from "metabase/static-viz/lib/svg";
import { registerEChartsModules } from "metabase/visualizations/echarts";
import { getChartMeasurements } from "metabase/visualizations/echarts/cartesian/chart-measurements";
import { getCartesianChartModel } from "metabase/visualizations/echarts/cartesian/model";
import { getLegendItems } from "metabase/visualizations/echarts/cartesian/model/legend";
import { getCartesianChartOption } from "metabase/visualizations/echarts/cartesian/option";
import { useAreAllDataPointsOutOfRange } from "metabase/visualizations/visualizations/CartesianChart/use-data-points-visible";

import Watermark from "../../watermark.svg?component";
import { Legend } from "../Legend";
import { calculateLegendRows } from "../Legend/utils";

const WIDTH = 540;
const HEIGHT = 360;
const LEGEND_PADDING = 8;

const DATA_OUT_OF_RANGE_RECT = {
  height: 40,
  width: 210,
};

registerEChartsModules();

export const ComboChart = ({
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
  const allPointsOutOfRange = useAreAllDataPointsOutOfRange(
    chartModel,
    settings,
  );

  const totalHeight = height + legendHeight;

  return (
    <>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={width}
        height={totalHeight}
      >
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
          <g>
            <rect
              x={width / 2 - DATA_OUT_OF_RANGE_RECT.width / 2}
              y={totalHeight / 2 - DATA_OUT_OF_RANGE_RECT.height / 2}
              fill={renderingContext.getColor("background-primary")}
              stroke={renderingContext.getColor("border")}
              strokeWidth="1"
              width={DATA_OUT_OF_RANGE_RECT.width}
              height={DATA_OUT_OF_RANGE_RECT.height}
              rx="8"
            />
            <text x="50%" y={totalHeight / 2 + 4} textAnchor="middle">
              {t`Every data point is out of range`}
            </text>
          </g>
        )}
      </svg>
    </>
  );
};
