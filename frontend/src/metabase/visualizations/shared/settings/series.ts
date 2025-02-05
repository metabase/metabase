import { getIn } from "icepick";
import _ from "underscore";

import { getColorsForValues } from "metabase/lib/colors/charts";
import { resolveConditions } from "metabase/visualizations/lib/settings/conditional";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import type { Series, VisualizationSettings } from "metabase-types/api";
import { isVizSettingValueConditions } from "metabase-types/guards";

export const SERIES_SETTING_KEY = "series_settings";
export const SERIES_COLORS_SETTING_KEY = "series_settings.colors";

export const getSeriesColors = (
  seriesVizSettingsKeys: string[],
  series: Series,
  settings: VisualizationSettings,
) => {
  const assignments = _.chain(seriesVizSettingsKeys)
    .map(key => [key, getIn(settings, [SERIES_SETTING_KEY, key, "color"])])
    .filter(([_key, color]) => color != null)
    .map(([key, color]) => {
      if (isVizSettingValueConditions(color)) {
        return [key, resolveConditions(color, series)];
      }
      return [key, color];
    })
    .object()
    .value();

  const legacyColors = settings["graph.colors"];
  if (legacyColors) {
    for (const [index, key] of seriesVizSettingsKeys.entries()) {
      if (!(key in assignments)) {
        assignments[key] = legacyColors[index];
      }
    }
  }

  return getColorsForValues(seriesVizSettingsKeys, assignments);
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

export const getSeriesDefaultShowSeriesValues = (
  settings: ComputedVisualizationSettings,
) => settings["graph.show_values"];
