import type { DatasetColumn, RowValue } from "metabase-types/api";

export type SeriesKey = string;

export type RegularSeriesDescriptor = {
  seriesKey: SeriesKey;
  datasetIndex: number;

  cardId: number;

  column: DatasetColumn;
  columnIndex: number;

  vizSettingsKey: string;
};

export type BreakoutSeriesDescriptor = RegularSeriesDescriptor & {
  breakoutColumn: DatasetColumn;
  breakoutColumnIndex: number;
  breakoutValue: RowValue;
};

export type SeriesDescriptor =
  | RegularSeriesDescriptor
  | BreakoutSeriesDescriptor;
