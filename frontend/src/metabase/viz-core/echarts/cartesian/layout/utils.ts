// Helpers shared by the upright (`index.ts`) and row (`row.ts`) layouts.
import type { ComputedVisualizationSettings, Padding } from "../../../types";
import type {
  ChartDataset,
  NumericAxisScaleTransforms,
  SeriesFormatters,
  SeriesModel,
  StackModel,
  StackedSeriesFormatters,
  XAxisModel,
  YAxisModel,
} from "../model/types";

import type { ChartBoundsCoords, TicksDimensions } from "./types";

export interface ChartLayoutInput {
  isRowChart?: boolean;
  xAxisModel: XAxisModel;
  leftAxisModel: YAxisModel | null;
  rightAxisModel: YAxisModel | null;
  splitPanelYAxisModels?: YAxisModel[];
  yAxisScaleTransforms: NumericAxisScaleTransforms;
  transformedDataset?: ChartDataset;
  dataset?: ChartDataset;
  seriesModels?: SeriesModel[];
  stackModels?: StackModel[];
  seriesLabelsFormatters?: SeriesFormatters;
  stackedLabelsFormatters?: StackedSeriesFormatters;
}

// Cartesian charts use `transformedDataset`; boxplot only has `dataset`.
export const getDataset = (input: ChartLayoutInput): ChartDataset => {
  return input.transformedDataset ?? input.dataset ?? [];
};

export const getYAxisExtentToMeasure = (
  axisModel: YAxisModel,
  settings: ComputedVisualizationSettings,
  yAxisScaleTransforms: NumericAxisScaleTransforms,
): [number, number] => {
  const [min, max] = axisModel.extent.map((extent) =>
    yAxisScaleTransforms.fromEChartsAxisValue(extent),
  );

  if (!settings["graph.y_axis.auto_range"]) {
    return [
      settings["graph.y_axis.min"] ?? min,
      settings["graph.y_axis.max"] ?? max,
    ];
  }

  if (
    settings["graph.y_axis.unpin_from_zero"] ||
    settings["graph.y_axis.scale"] === "log"
  ) {
    return [min, max];
  }

  return [Math.min(min, 0), Math.max(max, 0)];
};

// ECharts can add a last tick wider than we measured, e.g. "1,000" past a log
// axis whose data ends at "255".
export const TICK_OVERFLOW_BUFFER = 4;

// don't allow overflow greater than 12.5% of the chart width
export const MAX_OVERFLOW_PERCENTAGE = 0.125;

export const getChartBounds = (
  width: number,
  height: number,
  padding: Padding,
  ticksDimensions: TicksDimensions,
): ChartBoundsCoords => {
  return {
    top: padding.top,
    bottom: height - padding.bottom - ticksDimensions.xTicksHeight,
    left: padding.left + ticksDimensions.yTicksWidthLeft,
    right: width - padding.right - ticksDimensions.yTicksWidthRight,
  };
};
