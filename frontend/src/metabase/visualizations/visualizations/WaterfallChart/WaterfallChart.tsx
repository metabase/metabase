import { CartesianChart } from "metabase/visualizations/visualizations/CartesianChart";

import type { VisualizationProps } from "../../types";

import { WATERFALL_CHART_DEFINITION } from "./definition";

Object.assign(WaterfallChart, WATERFALL_CHART_DEFINITION);

export function WaterfallChart(props: VisualizationProps) {
  return <CartesianChart {...props} />;
}
