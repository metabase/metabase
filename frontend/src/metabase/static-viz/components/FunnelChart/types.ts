import { NumberFormatOptions } from "metabase/static-viz/lib/numbers";

export type Step = string | number;
export type Measure = number;

export type FunnelDatum = [Step, Measure];

export type FunnelSettings = {
  step: {
    name: string;
    format: NumberFormatOptions;
  };
  measure: {
    format: NumberFormatOptions;
  };
  colors: {
    textMedium: string;
    brand: string;
    border: string;
  };
};

export type FunnelStep = {
  step: string;
  measure: number;
  percent: number;
  top: number;
  left: number;
  height: number;
};
