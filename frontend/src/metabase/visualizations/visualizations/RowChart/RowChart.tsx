import { assignLazily } from "metabase/utils/merge-lazily";
import type { VisualizationProps } from "metabase/visualizations/types";
import { CartesianChart } from "metabase/visualizations/visualizations/CartesianChart";

import { ROW_CHART_DEFINITION } from "./definition";

// A rotated cartesian bar chart; see `BaseCartesianChartModel.isRowChart`.
function RowChartVisualization(props: VisualizationProps) {
  return <CartesianChart {...props} />;
}

export const RowChart = assignLazily(
  RowChartVisualization,
  ROW_CHART_DEFINITION,
);
