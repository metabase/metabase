import {
  type BaseCartesianChartModel,
  type ChartLayoutInput,
  type ComputedVisualizationSettings,
  type Padding,
  type RenderingContext,
  getChartLayout,
  getChartModelAtHeight,
} from "metabase/viz-core";

export interface ChartSize {
  width: number;
  height: number;
}

/** The plot a chart keeps inside its axes at one size. */
export interface Plot extends ChartSize {
  hasXAxisLabels: boolean;
  // the left axes' width minus the right axes'
  indent: number;
  internalInset: Pick<Padding, "left" | "right">;
}

/** One value for each option Auto weighs: no legend, a row, or a column. */
export interface LegendCandidates<T> {
  none: T;
  row: T;
  column: T;
}

export const mapLegendCandidates = <T, U>(
  candidates: LegendCandidates<T>,
  transform: (value: T) => U,
): LegendCandidates<U> => ({
  none: transform(candidates.none),
  row: transform(candidates.row),
  column: transform(candidates.column),
});

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
    const { padding, axisEnabledSetting, internalInset } = getChartLayout(
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
      internalInset,
    };
  });

export const getPlotsWithoutAxes = (
  chartSizes: LegendCandidates<ChartSize>,
): LegendCandidates<Plot> =>
  mapLegendCandidates(chartSizes, (size) => ({
    ...size,
    hasXAxisLabels: true,
    indent: 0,
    internalInset: { left: 0, right: 0 },
  }));
