import type {
  CustomSeriesOption,
  LineSeriesOption,
  BarSeriesOption,
  ScatterSeriesOption,
} from "echarts/charts";

export type EChartsSeriesOption =
  | LineSeriesOption
  | BarSeriesOption
  | ScatterSeriesOption
  | CustomSeriesOption;
