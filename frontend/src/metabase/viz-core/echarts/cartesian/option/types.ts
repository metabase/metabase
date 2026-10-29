import type {
  BarSeriesOption,
  CustomSeriesOption,
  LineSeriesOption,
  ScatterSeriesOption,
} from "echarts/charts";

export type EChartsSeriesOption =
  | LineSeriesOption
  | BarSeriesOption
  | ScatterSeriesOption
  | CustomSeriesOption;
