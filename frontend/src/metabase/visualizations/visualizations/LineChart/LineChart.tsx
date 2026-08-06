import { CartesianChart } from "metabase/visualizations/visualizations/CartesianChart";

import type { VisualizationProps } from "../../types";

import { LINE_CHART_DEFINITION } from "./definition";

function LineChartComponent(props: VisualizationProps) {
  return <CartesianChart {...props} />;
}

export const LineChart = Object.assign(
  LineChartComponent,
  LINE_CHART_DEFINITION,
);
