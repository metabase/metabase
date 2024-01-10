export type WaterfallDatum = {
  dimension: string;
  barOffset: number;
  increase: number | null;
  decrease: number | null;
  total: number | null;
};

export type WaterfallDataset = WaterfallDatum[];
