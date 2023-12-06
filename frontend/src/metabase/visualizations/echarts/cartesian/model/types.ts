import type { DatasetColumn, RowValue } from "metabase-types/api";

export type DataKey = string;
export type VizSettingsKey = string;
export type LegacySeriesSettingsObjectKey = {
  card: {
    _seriesKey: VizSettingsKey;
  };
};

export type LegacySeriesSettingsObjectKey = {
  card: {
    _seriesKey: string;
  };
};

export type RegularSeriesModel = {
  name: string;
  color: string;
  dataKey: DataKey;
  vizSettingsKey: VizSettingsKey;

  // TODO: remove when the settings definitions are updated for the dynamic combo chart.
  // This object is used as a key for the `series` function of the computed
  // visualization settings to get the computed series settings
  legacySeriesSettingsObjectKey: LegacySeriesSettingsObjectKey;

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
