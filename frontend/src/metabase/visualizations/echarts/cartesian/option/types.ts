import type { RegisteredSeriesOption } from "echarts";

import type { TREND_LINE_DATA_KEY } from "../constants/dataset";
import type { Datum } from "../model/types";

export type EChartsSeriesOption =
  | RegisteredSeriesOption["line"]
  | RegisteredSeriesOption["bar"]
  | RegisteredSeriesOption["scatter"];

export type TrendDataset = (Datum & {
  [TREND_LINE_DATA_KEY]: number;
})[];
