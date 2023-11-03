import type { ScaleBand, ScaleLinear, ScaleTime } from "d3-scale";
import type { ContinuousScaleType } from "metabase/visualizations/shared/types/scale";

export type XValue = string | number;
export type YValue = number;
export type SeriesDatum = [XValue, YValue];
export type SeriesData = SeriesDatum[];

export type XAxisType = ContinuousScaleType | "timeseries" | "ordinal";

export type YAxisPosition = "left" | "right";

export type VisualizationType = "waterfall";

interface BaseSeries {
  data: SeriesData;
  type: VisualizationType;
  yAxisPosition: YAxisPosition;
}

export interface Series extends BaseSeries {
  name: string;
  color: string;
}

export type StackedDatum = [XValue, YValue, YValue];

export type HydratedSeries = Series & {
  stackedData?: StackedDatum[];
};

export interface Dimensions {
  width: number;
  height: number;
}

export type DatumAccessor = (
  d: SeriesDatum,
  index?: number,
  data?: SeriesDatum[],
) => number;

export interface XScale<T = any> {
  scale: T extends ScaleBand<string | number>
    ? ScaleBand<string | number>
    : T extends ScaleTime<number, number, never>
    ? ScaleTime<number, number, never>
    : ScaleLinear<number, number, never>;
  bandwidth?: number;
  lineAccessor: DatumAccessor;
}
