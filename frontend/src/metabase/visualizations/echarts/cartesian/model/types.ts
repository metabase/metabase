import type { DatasetColumn, RowValue } from "metabase-types/api";

export type DataKey = string;
export type VizSettingsKey = string;

export type RegularSeriesModel = {
  dataKey: DataKey;
  vizSettingsKey: VizSettingsKey;

  cardId?: number;

  column: DatasetColumn;
  columnIndex: number;
};

export type BreakoutSeriesModel = RegularSeriesModel & {
  breakoutColumn: DatasetColumn;
  breakoutColumnIndex: number;
  breakoutValue: RowValue;
};

export type SeriesModel = RegularSeriesModel | BreakoutSeriesModel;

export type DimensionModel = {
  dataKey: DataKey;
  column: DatasetColumn;
  columnIndex: number;
};

export type GroupedDataset = Record<DataKey, RowValue>[];
export type Extent = [number, number];
export type SeriesExtents = Record<DataKey, Extent>;

export type AxisSplit = [DataKey[], DataKey[]];

export type CartesianChartModel = {
  dimensionModel: DimensionModel;
  seriesModels: SeriesModel[];
  dataset: GroupedDataset;
  normalizedDataset: GroupedDataset;
  yAxisSplit: AxisSplit;

  leftAxisColumn?: DatasetColumn;
  rightAxisColumn?: DatasetColumn;
};
