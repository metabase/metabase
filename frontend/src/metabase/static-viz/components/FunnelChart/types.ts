import type { NumberFormatOptions } from "metabase/static-viz/lib/numbers";
import type { VisualizationSettings } from "metabase-types/api";

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
