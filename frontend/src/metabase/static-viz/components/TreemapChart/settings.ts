import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import type { RawSeries } from "metabase-types/api";

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

export const computeTreemapChartSettings = (
  rawSeries: RawSeries,
): ComputedVisualizationSettings => {
  return rawSeries[0].card.visualization_settings;
};
