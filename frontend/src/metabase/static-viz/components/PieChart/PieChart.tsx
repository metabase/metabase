import { Group } from "@visx/group";
import { init } from "echarts";

import { sanitizeSvgForBatik } from "metabase/static-viz/lib/svg";
import { DIMENSIONS } from "metabase/visualizations/echarts/pie/constants";
import { getPieChartFormatters } from "metabase/visualizations/echarts/pie/format";
import { getPieChartModel } from "metabase/visualizations/echarts/pie/model";
import { getPieChartOption } from "metabase/visualizations/echarts/pie/option";

import Watermark from "../../watermark.svg?component";
import type { StaticChartProps } from "../StaticVisualization";

import { getPieChartLegend, getPieChartLegendHeight } from "./legend";

export function PieChart({
  rawSeries,
  renderingContext,
  settings,
  isStorybook,
  hasDevWatermark = false,
  width: providedWidth,
  height: providedHeight,
  fitLegendWithinHeight = false,
}: StaticChartProps) {
  const chartModel = getPieChartModel(
    rawSeries,
    settings,
    [],
    renderingContext,
  );
  const formatters = getPieChartFormatters(chartModel, settings);

  const useConstrainedMode =
    fitLegendWithinHeight && providedWidth != null && providedHeight != null;
  const effectiveWidth = useConstrainedMode
    ? providedWidth
    : DIMENSIONS.maxSideLength;

  let pieSideLength: number;
  let legendHeight: number;
  let Legend: () => JSX.Element;

  if (useConstrainedMode) {
    legendHeight = getPieChartLegendHeight(
      chartModel,
      formatters,
      settings,
      effectiveWidth,
    );
    pieSideLength = Math.max(
      Math.min(
        providedHeight - DIMENSIONS.padding.legend - legendHeight,
        effectiveWidth,
      ),
      50,
    );
    ({ Legend } = getPieChartLegend(
      chartModel,
      formatters,
      settings,
      effectiveWidth,
      pieSideLength + DIMENSIONS.padding.legend,
    ));
  } else {
    pieSideLength = DIMENSIONS.maxSideLength;
    ({ legendHeight, Legend } = getPieChartLegend(
      chartModel,
      formatters,
      settings,
    ));
  }

  const option = getPieChartOption(
    chartModel,
    formatters,
    settings,
    renderingContext,
    pieSideLength,
  );

  const chart = init(null, null, {
    renderer: "svg",
    ssr: true,
    width: pieSideLength,
    height: pieSideLength,
  });
  chart.setOption(option);
  const chartSvg = sanitizeSvgForBatik(
    chart.renderToSVGString(),
    isStorybook ?? false,
  );

  const height = useConstrainedMode
    ? providedHeight
    : DIMENSIONS.maxSideLength + DIMENSIONS.padding.legend + legendHeight;
  const width = effectiveWidth;

  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={width} height={height}>
      <Group dangerouslySetInnerHTML={{ __html: chartSvg }}></Group>
      <Legend />
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
