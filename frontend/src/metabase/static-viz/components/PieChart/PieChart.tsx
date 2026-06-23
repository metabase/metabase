import { Group } from "@visx/group";
import { init } from "echarts";

import { sanitizeSvgForBatik } from "metabase/static-viz/lib/svg";
import { DIMENSIONS } from "metabase/visualizations/echarts/pie/constants";
import { getPieChartFormatters } from "metabase/visualizations/echarts/pie/format";
import { getPieChartModel } from "metabase/visualizations/echarts/pie/model";
import { getPieChartOption } from "metabase/visualizations/echarts/pie/option";

import Watermark from "../../watermark.svg?component";
import { Legend } from "../Legend";
import { LEGEND_ITEM_MARGIN_RIGHT_GRID } from "../Legend/constants";
import type { StaticChartProps } from "../StaticVisualization";

import { getPieChartLegend, getPieChartSideLegend } from "./legend";

function renderPieSvg(
  option: ReturnType<typeof getPieChartOption>,
  side: number,
  isStorybook?: boolean,
) {
  const chart = init(null, null, {
    renderer: "svg",
    ssr: true,
    width: side,
    height: side,
  });
  chart.setOption(option);
  return sanitizeSvgForBatik(chart.renderToSVGString(), isStorybook ?? false);
}

export function PieChart({
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

  // When an explicit box is provided and it's square-or-wider, render the legend as a single
  // column to the LEFT of the circle (and enlarge the circle), matching the app's responsive
  // pie layout. Otherwise keep the default square-circle-with-legend-below layout (which is
  // also what subscription emails use, since they don't pass width/height).
  if (width != null && height != null && width >= height) {
    const totalW = width;
    const totalH = height;
    const gap = DIMENSIONS.padding.side;
    // Reserve room for the legend, but never more than ~45% of the width, and keep at least
    // half the height for the circle.
    const maxLegendW = Math.min(
      totalW * 0.45,
      Math.max(0, totalW - totalH * 0.5),
    );
    const { items, legendHeight, legendWidth } = getPieChartSideLegend(
      chartModel,
      formatters,
      settings,
      maxLegendW,
    );
    const legendColumnWidth = legendWidth > 0 ? legendWidth + gap : 0;
    const side = Math.max(0, Math.min(totalH, totalW - legendColumnWidth));
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
          left={legendColumnWidth}
          top={(totalH - side) / 2}
          dangerouslySetInnerHTML={{ __html: chartSvg }}
        ></Group>
        <Legend
          items={items}
          top={Math.max(0, (totalH - legendHeight) / 2)}
          left={gap}
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

  const option = getPieChartOption(
    chartModel,
    formatters,
    settings,
    renderingContext,
    DIMENSIONS.maxSideLength,
  );
  const { legendHeight, Legend: BottomLegend } = getPieChartLegend(
    chartModel,
    formatters,
    settings,
  );
  const chartSvg = renderPieSvg(option, DIMENSIONS.maxSideLength, isStorybook);

  const svgHeight =
    DIMENSIONS.maxSideLength + DIMENSIONS.padding.legend + legendHeight;
  const svgWidth = DIMENSIONS.maxSideLength;

  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={svgWidth} height={svgHeight}>
      <Group dangerouslySetInnerHTML={{ __html: chartSvg }}></Group>
      <BottomLegend />
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
