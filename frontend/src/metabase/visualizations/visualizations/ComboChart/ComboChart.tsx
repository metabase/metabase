import { CartesianChart } from "metabase/visualizations/visualizations/CartesianChart";

import type { VisualizationProps } from "../../types";

import { COMBO_CHART_DEFINITION } from "./definition";

Object.assign(ComboChart, COMBO_CHART_DEFINITION);

export function ComboChart(props: VisualizationProps) {
  return <CartesianChart {...props} />;
}
