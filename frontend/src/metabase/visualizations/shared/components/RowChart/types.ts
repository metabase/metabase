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

export type RowChartTheme = {
  axis: AxisStyle;
  dataLabels: ChartFont;
  goal: GoalStyle;
  grid: {
    color: string;
  };
};
