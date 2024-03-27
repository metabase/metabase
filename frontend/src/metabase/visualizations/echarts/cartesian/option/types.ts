import type { RegisteredSeriesOption } from "echarts";

import type { Datum } from "../model/types";
import type { TREND_LINE_DATA_KEY } from "../constants/dataset";

export type EChartsSeriesOption =
  | RegisteredSeriesOption["line"]
  | RegisteredSeriesOption["bar"]
  | RegisteredSeriesOption["scatter"];

export type TrendDataset = (Datum & {
  [TREND_LINE_DATA_KEY]: number;
})[];
