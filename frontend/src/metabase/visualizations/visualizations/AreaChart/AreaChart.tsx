import { CartesianChart } from "metabase/visualizations/visualizations/CartesianChart";

import type { VisualizationProps } from "../../types";

import { AREA_CHART_DEFINITION } from "./definition";

Object.assign(AreaChart, AREA_CHART_DEFINITION);

export function AreaChart(props: VisualizationProps) {
  return <CartesianChart {...props} />;
}
