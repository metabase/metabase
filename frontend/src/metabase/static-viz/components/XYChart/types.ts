import { DateFormatOptions } from "metabase/static-viz/lib/dates";
import { NumberFormatOptions } from "metabase/static-viz/lib/numbers";

export type Range = [number, number];
export type ContiniousDomain = [number, number];

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

type TickDisplay = "show" | "hide" | "rotate-45";

export type ChartSettings = {
  x: {
    type: XAxisType;
    tick_display?: TickDisplay;
    format: DateFormatOptions | NumberFormatOptions;
  };
  y: {
    type: YAxisType;
    format: NumberFormatOptions;
  };
  goal?: {
    value: number;
    label: string;
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

export type ChartStyle = {
  fontFamily: string;
  axes: {
    color: string;
    ticks: {
      color: string;
      fontSize: number;
    };
    labels: {
      color: string;
      fontSize: number;
      fontWeight: number;
    };
  };
  legend: {
    fontSize: number;
    lineHeight: number;
  };
  goalColor: string;
};
