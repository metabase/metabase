import type { Measure, Metric } from "metabase-types/api";

export type MetricOption = {
  type: "metric";
  data: Metric;
  value: string;
  label: string;
};

export type MeasureItem = {
  type: "measure";
  data: Measure;
  value: string;
  label: string;
};

export type MetricPickerItem = MetricOption | MeasureItem;
export type MetricPickerItemType = MetricPickerItem["type"];
