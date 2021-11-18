export type Range = [number, number];

export type XValue = string | number;
export type YValue = number;
export type SeriesDatum = [XValue, YValue];
export type SeriesData = SeriesDatum[];

export type XAxisType = "timeseries" | "linear" | "ordinal" | "pow" | "log";
export type YAxisType = "linear" | "pow" | "log";

export type YAxisPosition = "left" | "right";

export type VisualizationType = "line" | "area" | "bar";

export type Series = {
  name: string;
  color: string;
  data: SeriesData;
  type: VisualizationType;
  yAxisPosition: YAxisPosition;
};

export interface DateFormatSettings {
  date_style: string;
}

export interface NumberFormatSettings {
  number_style: string;
  decimals: number;
  currency?: string;
  currency_style?: string;
}

export type ChartSettings = {
  x: {
    type: XAxisType;
    format: DateFormatSettings | NumberFormatSettings;
  };
  y: {
    type: YAxisType;
    format: NumberFormatSettings;
  };
  labels: {
    left?: string;
    bottom?: string;
    right?: string;
  };
};

export interface Dimensions {
  width: number;
  height: number;
}

export interface Margin {
  top: number;
  right: number;
  bottom: number;
  left: number;
}
