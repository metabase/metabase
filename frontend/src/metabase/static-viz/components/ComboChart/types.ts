export type Datum<X = unknown, Y = unknown> = [X, Y];

export type VisualizationType = "line" | "area" | "bar";

export interface SeriesSettings {
  type: VisualizationType;
  color: string;
}

export interface Series<X = unknown, Y = unknown> {
  label: string;
  data: Datum<X, Y>[];
  settings: SeriesSettings;
}

export interface Dimensions {
  width: number;
  height: number;
}

export interface Margins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface ChartSize {
  dimensions: Dimensions;
  margins: Margins;
}
