import type { RegisteredSeriesOption } from "echarts";
import type { RowValue } from "metabase-types/api";

import type { DataKey } from "../model/types";
import type { TREND_LINE_DATA_KEY } from "../constants/dataset";

export type EChartsSeriesOption =
  | RegisteredSeriesOption["line"]
  | RegisteredSeriesOption["bar"]
  | RegisteredSeriesOption["scatter"];

export type TrendDataset = {
  [key: DataKey]: RowValue;
  [TREND_LINE_DATA_KEY]: number;
}[];
