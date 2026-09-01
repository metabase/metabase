import { CartesianChart } from "metabase/visualizations/visualizations/CartesianChart";

import type { VisualizationProps } from "../../types";

import { SCATTER_PLOT_DEFINITION } from "./definition";

function ScatterPlotComponent(props: VisualizationProps) {
  return <CartesianChart {...props} />;
}

export const ScatterPlot = Object.assign(
  ScatterPlotComponent,
  SCATTER_PLOT_DEFINITION,
);
