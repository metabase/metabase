import { CartesianChart } from "metabase/visualizations/visualizations/CartesianChart";

import type { VisualizationProps } from "../../types";

import { BAR_CHART_DEFINITION } from "./definition";

function BarChartComponent(props: VisualizationProps) {
  return <CartesianChart {...props} />;
}

export const BarChart = Object.assign(BarChartComponent, BAR_CHART_DEFINITION);
