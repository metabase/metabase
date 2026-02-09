import { getIn } from "icepick";

import { getColorsForValues } from "metabase/lib/colors/charts";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import type { VisualizationSettings } from "metabase-types/api";

export const SERIES_SETTING_KEY = "series_settings";
export const SERIES_COLORS_SETTING_KEY = "series_settings.colors";

export const getSeriesColors = (
  seriesVizSettingsKeys: string[],
  settings: VisualizationSettings,
  seriesVizSettingsDefaultKeys: string[],
) => {
  const assignments: Record<string, string> = {};

  const seriesSettings = getIn(settings, [SERIES_SETTING_KEY]) as
    | Record<string, { color?: string; title?: string }>
    | undefined;

  if (seriesSettings) {
    for (const [key, seriesObject] of Object.entries(seriesSettings)) {
      if (!seriesObject) {
        continue;
      }

      if (seriesObject.color != null) {
        assignments[key] = seriesObject.color;

        if (seriesObject.title != null) {
          assignments[seriesObject.title] = seriesObject.color;
        }
      }
    }
  }

  const legacyColors = settings["graph.colors"];
  if (legacyColors) {
    for (const [index, key] of seriesVizSettingsKeys.entries()) {
      if (!(key in assignments)) {
        assignments[key] = legacyColors[index];
      }
    }
  }

  return getColorsForValues(
    seriesVizSettingsKeys,
    assignments,
    undefined,
    seriesVizSettingsDefaultKeys,
  );
};

export const getSeriesDefaultDisplay = (cardDisplay: string, index: number) => {
  if (cardDisplay === "combo") {
    return index === 0 ? "line" : "bar";
  }

  return cardDisplay;
};

export const getSeriesDefaultLinearInterpolate = (
  settings: ComputedVisualizationSettings,
) => settings["line.interpolate"] ?? "linear";

export const getSeriesDefaultLineStyle = (
  settings: ComputedVisualizationSettings,
) => settings["line.style"] ?? "solid";

export const getSeriesDefaultLineSize = (
  settings: ComputedVisualizationSettings,
) => settings["line.size"] ?? "M";

export const getSeriesDefaultLineMarker = (
  settings: ComputedVisualizationSettings,
) =>
  settings["line.marker_enabled"] == null
    ? null
    : settings["line.marker_enabled"];

export const getSeriesDefaultLineMissing = (
  settings: ComputedVisualizationSettings,
) => settings["line.missing"] ?? "interpolate";

export const getSeriesDefaultShowSeriesTrendline = (
  settings: ComputedVisualizationSettings,
) => settings["graph.show_trendline"];

export const getSeriesDefaultShowSeriesValues = (
  settings: ComputedVisualizationSettings,
) => settings["graph.show_values"];
