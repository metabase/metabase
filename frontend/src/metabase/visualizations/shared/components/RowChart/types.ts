import { AxisStyle, ChartFont, GoalStyle } from "../../types/style";

export type XValue = number | null;
export type yValue = string;

export type Series<TDatum, TSeriesInfo = unknown> = {
  seriesKey: string;
  seriesName: string;
  xAccessor: (datum: TDatum) => XValue;
  yAccessor: (datum: TDatum) => yValue;
  seriesInfo?: TSeriesInfo;
};

export type BarData<TDatum> = {
  xStartValue: number;
  xEndValue: number;
  yValue: string;
  isNegative: boolean;
  originalDatum: TDatum;
  datumIndex: number;
};

export type SeriesData<TDatum> = {
  key: string;
  color: string;
  bars: BarData<TDatum>[];
  canShowValues: boolean;
};

export type RowChartTheme = {
  axis: AxisStyle;
  dataLabels: ChartFont;
  goal: GoalStyle;
  grid: {
    color: string;
  };
};

export type StackOffset = "diverging" | "expand" | null;
