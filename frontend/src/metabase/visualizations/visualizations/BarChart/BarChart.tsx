import { CartesianChart } from "metabase/visualizations/visualizations/CartesianChart";

import type { VisualizationProps } from "../../types";

import { BAR_CHART_DEFINITION } from "./definition";

Object.assign(BarChart, BAR_CHART_DEFINITION);

export function BarChart(props: VisualizationProps) {
  return <CartesianChart {...props} />;
}
