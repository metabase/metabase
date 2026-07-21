import { Group } from "@visx/group";

import { DIMENSIONS } from "metabase/visualizations/echarts/pie/constants";
import { getPieChartFormatters } from "metabase/visualizations/echarts/pie/format";
import { getPieChartModel } from "metabase/visualizations/echarts/pie/model";
import { getPieChartOption } from "metabase/visualizations/echarts/pie/option";

import Watermark from "../../watermark.svg?component";
import { Legend } from "../Legend";
import { LEGEND_ITEM_MARGIN_RIGHT_GRID } from "../Legend/constants";
import type { StaticChartProps } from "../StaticVisualization";

import { getPieChartSideLegendLayout, renderPieSvg } from "./utils";

type PieChartWithSideLegendProps = StaticChartProps & {
  width: number;
  height: number;
};

export function PieChartWithSideLegend({
  rawSeries,
  renderingContext,
  settings,
  isStorybook,
  hasDevWatermark = false,
  width,
  height,
}: PieChartWithSideLegendProps) {
  const chartModel = getPieChartModel(
    rawSeries,
    settings,
    [],
    renderingContext,
  );
  const formatters = getPieChartFormatters(chartModel, settings);

  const totalW = width;
  const totalH = height;
  const gap = DIMENSIONS.padding.side;
  // Reserve room for the legend, but never more than ~45% of the width, and keep at least
  // half the height for the circle.
  const maxLegendW = Math.min(
    totalW * 0.45,
    Math.max(0, totalW - totalH * 0.5),
  );
  const { items, legendHeight, legendWidth } = getPieChartSideLegendLayout(
    chartModel,
    formatters,
    settings,
    maxLegendW,
    totalH,
    renderingContext,
  );
  const legendColumnWidth = legendWidth > 0 ? legendWidth + gap : 0;
  const side = Math.max(0, Math.min(totalH, totalW - legendColumnWidth));

  // Center the legend+circle block so extra width splits evenly instead of hugging the left.
  const xOffset = Math.max(0, (totalW - (legendColumnWidth + side)) / 2);
  const option = getPieChartOption(
    chartModel,
    formatters,
    settings,
    renderingContext,
    side,
  );
  const chartSvg = renderPieSvg(option, side, isStorybook);

  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={totalW} height={totalH}>
      <Group
        left={xOffset + legendColumnWidth}
        top={(totalH - side) / 2}
        dangerouslySetInnerHTML={{ __html: chartSvg }}
      ></Group>
      <Legend
        items={items}
        top={Math.max(0, (totalH - legendHeight) / 2)}
        left={xOffset + gap}
        legendItemMarginRight={LEGEND_ITEM_MARGIN_RIGHT_GRID}
      />
      {hasDevWatermark && (
        <Watermark
          x="0"
          y="0"
          height={totalH}
          width={totalW}
          preserveAspectRatio="xMinYMin slice"
          fill={renderingContext.getColor("text-secondary")}
          opacity={0.2}
        />
      )}
    </svg>
  );
}
