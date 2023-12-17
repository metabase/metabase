import type { CartesianChartModel } from "../model/types";

export type WaterfallDatum = {
  dimension: string;
  barOffset: number;
  increase: number | null;
  decrease: number | null;
  total: number | null;
};

export type WaterfallDataset = WaterfallDatum[];

export type WaterfallChartModel = Omit<CartesianChartModel, "dataset"> & {
  dataset: WaterfallDataset;
  translationConstant: number;
};
