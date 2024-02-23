import type { ScaleBand, ScaleLinear, ScaleTime } from "d3-scale";

import type { DateFormatOptions } from "metabase/static-viz/lib/dates";
import type { NumberFormatOptions } from "metabase/static-viz/lib/numbers";
import type { ContinuousScaleType } from "metabase/visualizations/shared/types/scale";
import type { DatasetColumn, VisualizationSettings } from "metabase-types/api";

export type XValue = string | number;
export type YValue = number;
export type SeriesDatum = [XValue, YValue];
export type SeriesData = SeriesDatum[];

export type XAxisType = ContinuousScaleType | "timeseries" | "ordinal";
export type YAxisType = ContinuousScaleType;

export type YAxisPosition = "left" | "right";

export type VisualizationType = "line" | "area" | "bar" | "waterfall";

interface BaseSeries {
  data: SeriesData;
  type: VisualizationType;
  yAxisPosition: YAxisPosition;
}

export interface SeriesWithOneOrLessDimensions extends BaseSeries {
  cardName: string;
  // this could be null when rendering multiple scalars
  column: DatasetColumn | null;
}

export interface SeriesWithTwoDimensions extends BaseSeries {
  cardName: string;
  column: DatasetColumn;
  breakoutValue: string;
}

export type CardSeries = (
  | SeriesWithOneOrLessDimensions
  | SeriesWithTwoDimensions
)[];

export interface Series extends BaseSeries {
  name: string;
  color: string;
}

export type StackedDatum = [XValue, YValue, YValue];

export type HydratedSeries = Series & {
  stackedData?: StackedDatum[];
};

type TickDisplay = "show" | "hide" | "rotate-90";
type Stacking = "stack" | "none";

export type ChartSettings = {
  stacking?: Stacking;
  x: {
    type: XAxisType;
    tick_display?: TickDisplay;
    format?: DateFormatOptions | NumberFormatOptions;
  };
  y: {
    type: YAxisType;
    format?: NumberFormatOptions;
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
  visualization_settings: VisualizationSettings;
};

export interface Dimensions {
  width: number;
  height: number;
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
    fontWeight: number;
  };
  value?: {
    color: string;
    fontSize: number;
    fontWeight: number;
    stroke: string;
    strokeWidth: number;
  };
  goalColor: string;
};

export type DatumAccessor = (
  d: SeriesDatum,
  index?: number,
  data?: SeriesDatum[],
) => number;
export type StackedDatumAccessor = (
  d: StackedDatum,
  index?: number,
  data?: StackedDatum[],
) => number;

export interface XScale<T = any> {
  scale: T extends ScaleBand<string | number>
    ? ScaleBand<string | number>
    : T extends ScaleTime<number, number, never>
    ? ScaleTime<number, number, never>
    : ScaleLinear<number, number, never>;
  bandwidth?: number;
  lineAccessor: DatumAccessor;
  barAccessor?: DatumAccessor;
}
