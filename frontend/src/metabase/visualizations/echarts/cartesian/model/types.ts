import type { Insight } from "metabase-types/api/insight";

import type { CardId, DatasetColumn, RowValue } from "metabase-types/api";

export type BreakoutValue = RowValue;
export type ColumnName = string;

export type DataKey =
  | `${Nullable<CardId>}:${ColumnName}:${BreakoutValue}`
  | `${Nullable<CardId>}:${ColumnName}`;

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

export type ScatterSeriesModel = (RegularSeriesModel | BreakoutSeriesModel) & {
  bubbleSizeDataKey?: DataKey;
};

export type SeriesModel =
  | RegularSeriesModel
  | BreakoutSeriesModel
  | ScatterSeriesModel;

export type DimensionModel = {
  dataKey: DataKey;
  column: DatasetColumn;
  columnIndex: number;
};

export type Datum = Record<DataKey, RowValue>;
export type ChartDataset = Datum[];
export type Extent = [number, number];
export type SeriesExtents = Record<DataKey, Extent>;
export type AxisFormatter = (value: RowValue) => string;

export type XAxisModel = {
  label?: string;
  formatter: AxisFormatter;
};

export type YAxisModel = {
  seriesKeys: DataKey[];
  extent: Extent;
  // Although multiple series from different columns belong to an axis
  // there is one column that is used for the axis ticks formatting
  column: DatasetColumn;
  label?: string;
  formatter: AxisFormatter;
};

export type CartesianChartModel = {
  dimensionModel: DimensionModel;
  seriesModels: SeriesModel[];
  columnByDataKey: Record<DataKey, DatasetColumn>;
  dataset: ChartDataset;
  transformedDataset: ChartDataset;

  leftAxisModel: YAxisModel | null;
  rightAxisModel: YAxisModel | null;

  xAxisModel: XAxisModel;

  insights: Insight[];

  bubbleSizeDomain: Extent | null;
};
