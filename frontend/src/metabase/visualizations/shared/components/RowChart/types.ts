import { AxisStyle, ChartFont, GoalStyle } from "../../types/style";

export type XValue = number | null;
export type YValue = string | number | boolean;

export type Series<TDatum, TSeriesInfo = unknown> = {
  seriesKey: string;
  seriesName: string;
  xAccessor: (datum: TDatum) => XValue;
  yAccessor: (datum: TDatum) => YValue;
  seriesInfo?: TSeriesInfo;
};

export type BarData<TDatum, TSeriesInfo = unknown> = {
  xStartValue: number;
  xEndValue: number;
  yValue: YValue;
  isNegative: boolean;
  isBorderValue?: boolean;
  datum: TDatum;
  datumIndex: number;
  series: Series<TDatum, TSeriesInfo>;
  seriesIndex: number;
};

export type SeriesData<TDatum, TSeriesInfo = unknown> = {
  key: string;
  color: string;
  bars: BarData<TDatum, TSeriesInfo>[];
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
