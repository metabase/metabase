import type { DatasetColumn, RowValue, RowValues } from "metabase-types/api";

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

export type XValue = number | null;
export type YValue = string | number | boolean | null;

export type Series<TDatum, TSeriesInfo = unknown> = {
  seriesKey: string;
  seriesName: string;
  xAccessor: (datum: TDatum) => XValue;
  yAccessor: (datum: TDatum) => YValue;
  seriesInfo?: TSeriesInfo;
};
