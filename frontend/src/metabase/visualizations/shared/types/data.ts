import { DatasetColumn, DatasetData, RowValue } from "metabase-types/api";

export type TwoDimensionalChartData = Pick<DatasetData, "rows" | "cols">;

export type SeriesInfo = {
  metricColumn: DatasetColumn;
  dimensionColumn: DatasetColumn;
  breakoutValue?: RowValue;
};

export type MetricValue = number | null;
export type MetricName = string;
export type BreakoutName = string;
export type MetricDatum = { [key: MetricName]: MetricValue };

export type GroupedDatum = {
  dimensionValue: RowValue;
  metrics: MetricDatum;
  breakout?: { [key: BreakoutName]: MetricDatum };
};

export type GroupedDataset = GroupedDatum[];
