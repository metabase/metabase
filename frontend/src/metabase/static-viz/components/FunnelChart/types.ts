import type { NumberFormatOptions } from "metabase/static-viz/lib/numbers";
import type { VisualizationSettings } from "metabase-types/api";

export type Step = string | number;
export type Measure = number;

export type FunnelDatum = [Step, Measure];

export type FunnelSettings = {
  step: {
    name: string;
    format?: NumberFormatOptions;
  };
  measure: {
    format: NumberFormatOptions;
  };
  colors: {
    textMedium: string;
    brand: string;
    border: string;
  };
  visualization_settings: VisualizationSettings;
};

export type FunnelStep = {
  step: string | number;
  measure: number;
  percent: number;
  top: number;
  left: number;
  height: number;
};
