import type { CartesianChartModel } from "../model/types";

// using "-" instead of null to avoid type error
// with echarts' `DatasetOption.source` type, which
// doesn't allow null for some reason
export type WaterfallEmptyValue = "-";

export type WaterfallDatum = {
  dimension: string;
  barOffset: number;
  increase: number | WaterfallEmptyValue;
  decrease: number | WaterfallEmptyValue;
  total: number | WaterfallEmptyValue;
};

export type WaterfallDataset = WaterfallDatum[];

export type WaterfallChartModel = Omit<CartesianChartModel, "dataset"> & {
  dataset: WaterfallDataset;
  negativeTranslation: number;
};
