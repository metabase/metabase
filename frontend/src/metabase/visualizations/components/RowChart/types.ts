export type XValue = number | null;
export type yValue = string;

export type Series<TDatum, TSeriesInfo = unknown> = {
  seriesKey: string;
  seriesName: string;
  xAccessor: (datum: TDatum) => XValue;
  yAccessor: (datum: TDatum) => yValue;
  seriesInfo?: TSeriesInfo;
};
