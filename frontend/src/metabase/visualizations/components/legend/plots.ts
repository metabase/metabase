import {
  type ChartLayoutInput,
  type ComputedVisualizationSettings,
  type RenderingContext,
  getChartLayout,
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

export interface LegendChart {
  layoutInput: ChartLayoutInput;
  settings: ComputedVisualizationSettings;
  hasTimelineEvents: boolean;
  renderingContext: RenderingContext;
}

export const getLegendPlots = (
  chart: LegendChart,
  chartSizes: LegendCandidates<ChartSize>,
): LegendCandidates<Plot> =>
  mapLegendCandidates(chartSizes, ({ width, height }) => {
    const { padding, axisEnabledSetting } = getChartLayout(
      chart.layoutInput,
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
