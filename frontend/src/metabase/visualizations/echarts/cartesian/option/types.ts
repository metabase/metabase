import type { RegisteredSeriesOption } from "echarts";

export type EChartsSeriesOption =
  | RegisteredSeriesOption["line"]
  | RegisteredSeriesOption["bar"]
  | RegisteredSeriesOption["scatter"]
  | RegisteredSeriesOption["custom"];
