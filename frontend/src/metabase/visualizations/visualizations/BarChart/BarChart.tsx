import { CartesianChart } from "metabase/visualizations/visualizations/CartesianChart";

import type { VisualizationProps } from "../../types";

import { BAR_CHART_DEFINITION } from "./definition";

function BarChart(props: VisualizationProps) {
  return <CartesianChart {...props} />;
}

// Exporting the Object.assign result (instead of assigning onto the function
// declaration as a statement) keeps the definition statics visible to the type
// system, so registerVisualization accepts the component without a cast.
const BarChartWrapper = Object.assign(BarChart, BAR_CHART_DEFINITION);

export { BarChartWrapper as BarChart };
