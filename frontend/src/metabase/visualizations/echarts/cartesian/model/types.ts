import type { DatasetColumn, RowValue } from "metabase-types/api";
import type { Insight } from "metabase-types/api/insight";

export type DataKey = string;
export type VizSettingsKey = string;

export type LegacySeriesSettingsObjectKey = {
  card: {
    _seriesKey: VizSettingsKey;
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

export type Datum = Record<DataKey, RowValue>;
export type GroupedDataset = Datum[];
export type Extent = [number, number];
export type SeriesExtents = Record<DataKey, Extent>;

export type AxisSplit = [DataKey[], DataKey[]];
export type AxisExtent = Extent | null;
export type AxisExtents = [AxisExtent, AxisExtent];

export type CartesianChartModel = {
  dimensionModel: DimensionModel;
  seriesModels: SeriesModel[];
  dataset: GroupedDataset;
  transformedDataset: GroupedDataset;
  yAxisSplit: AxisSplit;
  yAxisExtents: AxisExtents;

  leftAxisColumn?: DatasetColumn;
  rightAxisColumn?: DatasetColumn;
  insights: Insight[];

  // For scatter plot
  bubbleSizeDataKey?: DataKey;
};
