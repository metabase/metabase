import {
  type BaseCartesianChartModel,
  type ChartLayoutInput,
  type ComputedVisualizationSettings,
  type RenderingContext,
  getChartLayout,
  getChartModelAtHeight,
} from "metabase/viz-core";

import {
  type ChartSize,
  type LegendCandidates,
  type Plot,
  mapLegendCandidates,
} from "./layout";

/**
 * What the legend needs to lay the chart out at each candidate size. A row
 * chart folds to each height, so a cartesian chart comes as its unfolded model.
 */
export type LegendChart = {
  settings: ComputedVisualizationSettings;
  hasTimelineEvents: boolean;
  renderingContext: RenderingContext;
} & (
  | { chartModel: BaseCartesianChartModel }
  | { layoutInput: ChartLayoutInput }
);

const getLayoutInputAtHeight = (
  chart: LegendChart,
  height: number,
): ChartLayoutInput =>
  "chartModel" in chart
    ? getChartModelAtHeight(chart.chartModel, height, chart.settings)
    : chart.layoutInput;

export const getLegendPlots = (
  chart: LegendChart,
  chartSizes: LegendCandidates<ChartSize>,
): LegendCandidates<Plot> =>
  mapLegendCandidates(chartSizes, ({ width, height }) => {
    const { padding, axisEnabledSetting } = getChartLayout(
      getLayoutInputAtHeight(chart, height),
      chart.settings,
      chart.hasTimelineEvents,
      width,
      height,
      chart.renderingContext,
    );
    return {
      width: width - padding.left - padding.right,
      height: height - padding.top - padding.bottom,
      hasXAxisLabels: axisEnabledSetting !== false,
      indent: padding.left - padding.right,
    };
  });

export const getPlotsWithoutAxes = (
  chartSizes: LegendCandidates<ChartSize>,
): LegendCandidates<Plot> =>
  mapLegendCandidates(chartSizes, (size) => ({
    ...size,
    hasXAxisLabels: true,
    indent: 0,
  }));
