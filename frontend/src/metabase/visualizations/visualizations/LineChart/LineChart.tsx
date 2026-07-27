import { CartesianChart } from "metabase/visualizations/visualizations/CartesianChart";

import type { VisualizationProps } from "../../types";

import { LINE_CHART_DEFINITION } from "./definition";

Object.assign(LineChart, LINE_CHART_DEFINITION);

export function LineChart(props: VisualizationProps) {
  return <CartesianChart {...props} />;
}
