import type { DatasetColumn, RowValue } from "metabase-types/api";
import type { ChartColumns } from "metabase/visualizations/lib/graph/columns";

export type DataKey = string;

export type RegularSeriesModel = {
  dataKey: DataKey;
  datasetIndex: number;

  cardId?: number;
  cardName?: string;

  column: DatasetColumn;
  columnIndex: number;
};

export type BreakoutSeriesModel = RegularSeriesModel & {
  breakoutColumn: DatasetColumn;
  breakoutColumnIndex: number;
  breakoutValue: RowValue;
};

export type SeriesModel = RegularSeriesModel | BreakoutSeriesModel;

export type CardSeriesModel = {
  dimension: RegularSeriesModel;
  metrics: SeriesModel[];
};

export type CartesianChartCardModel = {
  columns: ChartColumns;
  series: CardSeriesModel;
  dataset: Record<DataKey, RowValue>[];
};

export type CartesianChartModel = CartesianChartCardModel[];
