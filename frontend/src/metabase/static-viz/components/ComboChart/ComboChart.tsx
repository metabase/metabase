import { Group } from "@visx/group";
import { init } from "echarts/core";

import type { StaticChartProps } from "metabase/static-viz/components/StaticVisualization";
import { readAllPointsOutOfRange } from "metabase/static-viz/lib/data-visibility";
import { sanitizeSvgForBatik } from "metabase/static-viz/lib/svg";
import { getChartHeight } from "metabase/static-viz/lib/utils";
import {
  foldRowChartModel,
  getCartesianChartModel,
  getCartesianChartOption,
  getChartLayout,
  getLegendItems,
  registerEChartsModules,
} from "metabase/viz-core";

import Watermark from "../../watermark.svg?component";
import { DataOutOfRangeOverlay } from "../DataOutOfRangeOverlay/DataOutOfRangeOverlay";
import { Legend } from "../Legend";
import { calculateLegendRows } from "../Legend/utils";

const WIDTH = 540;
const HEIGHT = 360;
// TEMPORARY(row-chart-migration): legacy StaticRowChart's default size, so Loki
// diffs compare like with like. Remove before shipping; 540×360 is intended.
const LEGACY_ROW_WIDTH = 620;
const LEGACY_ROW_HEIGHT = 440;
const LEGEND_PADDING = 8;

registerEChartsModules();

export const ComboChart = ({
  rawSeries,
  settings,
  renderingContext,
  width: widthProp,
  height: heightProp,
  isStorybook = false,
  hasDevWatermark = false,
  fitWithinBounds = false,
}: StaticChartProps) => {
  const isRowChart = rawSeries[0]?.card.display === "row";
  // TEMPORARY(row-chart-migration): revert to `width = WIDTH` / `height = HEIGHT` defaults.
  const width = widthProp ?? (isRowChart ? LEGACY_ROW_WIDTH : WIDTH);
  const height = heightProp ?? (isRowChart ? LEGACY_ROW_HEIGHT : HEIGHT);

  const baseChartModel = getCartesianChartModel(
    rawSeries,
    settings,
    [],
    renderingContext,
  );

  const legendItems = getLegendItems(baseChartModel.seriesModels);
  const isReversed = settings["legend.is_reversed"];
  const { height: legendHeight, items: legendLayoutItems } =
    calculateLegendRows({
      items: legendItems,
      width,
      horizontalPadding: LEGEND_PADDING,
      verticalPadding: LEGEND_PADDING,
      isReversed,
    });

  const chartHeight = getChartHeight({ fitWithinBounds, legendHeight, height });

  // Fold before layout, off the plot height, as the interactive path does.
  const chartModel = isRowChart
    ? foldRowChartModel(baseChartModel, chartHeight, settings)
    : baseChartModel;

  const chart = init(null, null, {
    renderer: "svg",
    ssr: true,
    width,
    height: chartHeight,
  });

  const chartLayout = getChartLayout(
    chartModel,
    settings,
    false,
    width,
    chartHeight,
    renderingContext,
  );

  const option = getCartesianChartOption(
    chartModel,
    chartLayout,
    false,
    null,
    [],
    settings,
    width,
    false,
    renderingContext,
  );

  chart.setOption(option);

  const chartSvg = sanitizeSvgForBatik(chart.renderToSVGString(), isStorybook);

  const allPointsOutOfRange = readAllPointsOutOfRange(chart);

  chart.dispose();

  const totalHeight = fitWithinBounds ? height : height + legendHeight;

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
          <DataOutOfRangeOverlay
            width={width}
            height={totalHeight}
            renderingContext={renderingContext}
          />
        )}
      </svg>
    </>
  );
};
