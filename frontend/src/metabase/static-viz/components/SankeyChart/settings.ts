import type {
  ComputedVisualizationSettings,
  RenderingContext,
} from "metabase/visualizations/types";
import type { RawSeries, VisualizationSettings } from "metabase-types/api";

export const fillWithDefaultValue = (
  settings: Record<string, unknown>,
  key: string,
  defaultValue: unknown,
  isValid = true,
) => {
  if (typeof settings[key] === "undefined" || !isValid) {
    settings[key] = defaultValue;
  }
};

export const computeSankeyChartSettings = (
  rawSeries: RawSeries,
  dashcardSettings: VisualizationSettings,
  renderingContext: RenderingContext,
): ComputedVisualizationSettings => {
  return rawSeries[0].card.visualization_settings;
};
