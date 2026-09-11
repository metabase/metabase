import { assignLazily } from "metabase/utils/merge-lazily";
import { CartesianChart } from "metabase/visualizations/visualizations/CartesianChart";

import type { VisualizationProps } from "../../types";

import { AREA_CHART_DEFINITION } from "./definition";

function AreaChartComponent(props: VisualizationProps) {
  return <CartesianChart {...props} />;
}

export const AreaChart = assignLazily(
  AreaChartComponent,
  AREA_CHART_DEFINITION,
);
