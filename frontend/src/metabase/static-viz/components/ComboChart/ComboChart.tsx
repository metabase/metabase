import { init } from "echarts/core";

import type { StaticChartProps } from "metabase/static-viz/components/StaticVisualization";
import { readAllPointsOutOfRange } from "metabase/static-viz/lib/data-visibility";
import { withCartesianChartSize } from "metabase/static-viz/lib/rendering-context";
import { sanitizeSvgForBatik } from "metabase/static-viz/lib/svg";
import {
  STATIC_CARTESIAN_CHART_SIZE,
  STATIC_ROW_CHART_SIZE,
} from "metabase/static-viz/lib/utils";
import {
  getCartesianChartModel,
  getCartesianChartOption,
  getChartLayout,
  getChartModelAtHeight,
  getLegendItems,
  getSizeAdjustedSettings,
  isRowChartSeries,
  registerEChartsModules,
} from "metabase/viz-core";
import type { RawSeries } from "metabase-types/api";

import Watermark from "../../watermark.svg?component";
import { DataOutOfRangeOverlay } from "../DataOutOfRangeOverlay/DataOutOfRangeOverlay";
import { Legend } from "../Legend";
import { getPlotBounds, layoutChartWithBottomLegend } from "../Legend/layout";

registerEChartsModules();

const getDefaultSize = (rawSeries: RawSeries) =>
  isRowChartSeries(rawSeries)
    ? STATIC_ROW_CHART_SIZE
    : STATIC_CARTESIAN_CHART_SIZE;

export const ComboChart = ({
  rawSeries,
  settings: originalSettings,
  renderingContext: originalRenderingContext,
  width = getDefaultSize(rawSeries).width,
  height = getDefaultSize(rawSeries).height,
  isStorybook = false,
  hasDevWatermark = false,
  fitWithinBounds = false,
  gridSize,
}: StaticChartProps) => {
  const renderingContext = withCartesianChartSize(originalRenderingContext, {
    width,
    height,
  });
  const settings = getSizeAdjustedSettings({
    settings: originalSettings,
    width,
    height,
    gridSize,
  });
  const baseChartModel = getCartesianChartModel(
    rawSeries,
    settings,
    [],
    renderingContext,
  );

  const {
    chartHeight,
    legend,
    layout: { chartModel, chartLayout },
  } = layoutChartWithBottomLegend({
    items: getLegendItems(baseChartModel.seriesModels),
    chartWidth: width,
    height,
    fitWithinBounds,
    isReversed: settings["legend.is_reversed"],
    // Fold before layout, off the chart height, as the interactive path does.
    getLayout: (chartHeight) => {
      const chartModel = getChartModelAtHeight(
        baseChartModel,
        chartHeight,
        settings,
      );
      return {
        chartModel,
        chartLayout: getChartLayout(
          chartModel,
          settings,
          false,
          width,
          chartHeight,
          renderingContext,
        ),
      };
    },
    getPlot: ({ chartLayout }) => getPlotBounds(chartLayout.padding, width),
  });

  const chart = init(null, null, {
    renderer: "svg",
    ssr: true,
    width,
    height: chartHeight,
  });

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

  const totalHeight = fitWithinBounds ? height : height + legend.height;

  return (
    <>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={width}
        height={totalHeight}
      >
        <g dangerouslySetInnerHTML={{ __html: chartSvg }}></g>
        <Legend top={chartHeight} items={legend.items} />
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
