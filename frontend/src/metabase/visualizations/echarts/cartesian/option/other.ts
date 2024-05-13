import type {
  ComputedVisualizationSettings,
  RenderingContext,
} from "metabase/visualizations/types";

import type { ChartMeasurements } from "../chart-measurements/types";
import type { CartesianChartModel } from "../model/types";

import { buildEChartsBarSeries } from "./series";

export function getOtherSeriesOption(
  chartModel: CartesianChartModel,
  chartMeasurements: ChartMeasurements,
  settings: ComputedVisualizationSettings,
  renderingContext: RenderingContext,
) {
  // TODO handle area chart
  return buildEChartsBarSeries(
    chartModel.dataset,
    chartModel.xAxisModel,
    chartModel.yAxisScaleTransforms,
    chartMeasurements,
    chartModel.otherSeriesModel,
    settings,
    0,
    settings["graph.max_categories"] + 1, // TODO extract this?
    1, // TODO fix
    true,
    renderingContext,
  );
}
