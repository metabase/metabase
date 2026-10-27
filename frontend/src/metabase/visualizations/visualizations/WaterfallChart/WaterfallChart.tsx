import { assignLazily } from "metabase/utils/merge-lazily";
import { CartesianChart } from "metabase/visualizations/visualizations/CartesianChart";

import type { VisualizationProps } from "../../types";

import { WATERFALL_CHART_DEFINITION } from "./definition";

function WaterfallChartComponent(props: VisualizationProps) {
  return <CartesianChart {...props} />;
}

export const WaterfallChart = assignLazily(
  WaterfallChartComponent,
  WATERFALL_CHART_DEFINITION,
);
