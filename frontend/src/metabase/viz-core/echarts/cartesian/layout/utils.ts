// Helpers shared by the upright (`index.ts`) and row (`row.ts`) layouts.
import type { Padding } from "../../../types";
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
