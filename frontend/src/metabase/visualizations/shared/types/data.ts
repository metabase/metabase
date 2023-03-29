import {
  DatasetColumn,
  DatasetData,
  RowValue,
  RowValues,
} from "metabase-types/api";

export type TwoDimensionalChartData = Pick<DatasetData, "rows" | "cols">;

export type RemappingHydratedDatasetColumn = DatasetColumn & {
  remapped_from_index?: number;
  remapped_to_column?: DatasetColumn;
  remapping?: Map<any, any>;
};

export type RemappingHydratedChartData = {
  rows: DatasetData["rows"];
  cols: RemappingHydratedDatasetColumn[];
};

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
  isClickable?: boolean;
  breakout?: {
    [key: BreakoutName]: {
      metrics: MetricDatum;
      rawRows: RowValues[];
    };
  };
  rawRows: RowValues[];
};

export type GroupedDataset = GroupedDatum[];
