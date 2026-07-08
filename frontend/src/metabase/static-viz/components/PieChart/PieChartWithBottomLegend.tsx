import { Group } from "@visx/group";

import { DIMENSIONS } from "metabase/visualizations/echarts/pie/constants";
import { getPieChartFormatters } from "metabase/visualizations/echarts/pie/format";
import { getPieChartModel } from "metabase/visualizations/echarts/pie/model";
import { getPieChartOption } from "metabase/visualizations/echarts/pie/option";

import Watermark from "../../watermark.svg?component";
import { Legend } from "../Legend";
import { LEGEND_ITEM_MARGIN_RIGHT_GRID } from "../Legend/constants";
import type { StaticChartProps } from "../StaticVisualization";

import { getPieChartBottomLegendLayout, renderPieSvg } from "./utils";

// The circle takes at most this fraction of the box height, leaving room for the legend below.
const MAX_CIRCLE_HEIGHT_RATIO = 0.7;

export function PieChartWithBottomLegend({
  rawSeries,
  renderingContext,
  settings,
  isStorybook,
  hasDevWatermark = false,
  width,
  height,
}: StaticChartProps) {
  const chartModel = getPieChartModel(
    rawSeries,
    settings,
    [],
    renderingContext,
  );
  const formatters = getPieChartFormatters(chartModel, settings);

  const hasDimensions = width != null && height != null;
  const gap = DIMENSIONS.padding.legend;
  const side = hasDimensions
    ? Math.max(0, Math.min(width, height * MAX_CIRCLE_HEIGHT_RATIO))
    : DIMENSIONS.maxSideLength;

  const { items, legendHeight, legendWidth } = getPieChartBottomLegendLayout(
    chartModel,
    formatters,
    settings,
    hasDimensions ? width : DIMENSIONS.maxSideLength,
    hasDimensions ? Math.max(0, height - side - gap) : undefined,
    renderingContext,
  );

  const option = getPieChartOption(
    chartModel,
    formatters,
    settings,
    renderingContext,
    side,
  );
  const chartSvg = renderPieSvg(option, side, isStorybook);

  const svgWidth = hasDimensions ? width : DIMENSIONS.maxSideLength;
  const svgHeight = hasDimensions ? height : side + gap + legendHeight;

  // Vertically center the [circle | gap | legend] block in the box (top-anchored for emails).
  const blockHeight = side + gap + legendHeight;
  const topOffset = hasDimensions
    ? Math.max(0, (svgHeight - blockHeight) / 2)
    : 0;
  // The grid positions items from `padding.side`, so back it out to center the content.
  const legendLeft = (svgWidth - legendWidth) / 2 - DIMENSIONS.padding.side;

  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={svgWidth} height={svgHeight}>
      <Group
        left={(svgWidth - side) / 2}
        top={topOffset}
        dangerouslySetInnerHTML={{ __html: chartSvg }}
      ></Group>
      <Legend
        items={items}
        top={topOffset + side + gap}
        left={legendLeft}
        legendItemMarginRight={LEGEND_ITEM_MARGIN_RIGHT_GRID}
      />
      {hasDevWatermark && (
        <Watermark
          x="0"
          y="0"
          height={svgHeight}
          width={svgWidth}
          preserveAspectRatio="xMinYMin slice"
          fill={renderingContext.getColor("text-secondary")}
          opacity={0.2}
        />
      )}
    </svg>
  );
}
