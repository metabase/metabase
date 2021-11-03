export type Datum<X = unknown, Y = unknown> = [X, Y];
export type Data<X = unknown, Y = unknown> = Datum<X, Y>[];

export type VisualizationType = "line" | "area" | "bar";

export interface SeriesSettings {
  type: VisualizationType;
  color: string;
}

export interface Series<X = unknown, Y = unknown> {
  label: string;
  data: Data<X, Y>;
  settings: SeriesSettings;
}

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

export interface ChartSize {
  dimensions: Dimensions;
  margin: Margin;
}

export interface DateFormatSettings {
  date_style: string;
}

export interface NumberFormatSettings {
  number_style: string;
  decimals: number;
  currency?: string;
  currency_style?: string;
}

export interface Labels {
  left: string;
  bottom: string;
}

export interface Colors {
  brand?: string;
}
