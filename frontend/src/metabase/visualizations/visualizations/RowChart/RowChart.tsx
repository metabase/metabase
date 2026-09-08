import { assignLazily } from "metabase/utils/merge-lazily";
import type { VisualizationProps } from "metabase/visualizations/types";
import { CartesianChart } from "metabase/visualizations/visualizations/CartesianChart";

import { ROW_CHART_DEFINITION } from "./definition";

/**
 * Row charts render through the shared ECharts cartesian engine, with the
 * dimension on the vertical axis and the metrics on the horizontal one. The
 * rotation itself lives in the axis swap in `option/index.ts`, keyed off
 * `ChartLayout.isRowChart`.
 */
function RowChartVisualization(props: VisualizationProps) {
  return <CartesianChart {...props} />;
}

export const RowChart = assignLazily(
  RowChartVisualization,
  ROW_CHART_DEFINITION,
);
