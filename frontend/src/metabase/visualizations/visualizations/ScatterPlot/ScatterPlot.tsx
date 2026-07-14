import { CartesianChart } from "metabase/visualizations/visualizations/CartesianChart";

import type { VisualizationProps } from "../../types";

import { SCATTER_PLOT_DEFINITION } from "./definition";

Object.assign(ScatterPlot, SCATTER_PLOT_DEFINITION);

export function ScatterPlot(props: VisualizationProps) {
  return <CartesianChart {...props} />;
}
