import { CartesianChart } from "metabase/visualizations/visualizations/CartesianChart";

import type { VisualizationProps } from "../../types";

import { COMBO_CHART_DEFINITION } from "./definition";

function ComboChartComponent(props: VisualizationProps) {
  return <CartesianChart {...props} />;
}

export const ComboChart = Object.assign(
  ComboChartComponent,
  COMBO_CHART_DEFINITION,
);
