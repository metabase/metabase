import _ from "underscore";
import { getIn } from "icepick";
import type { VisualizationSettings } from "metabase-types/api";
import { getColorsForValues } from "metabase/lib/colors/charts";

export const SETTING_ID = "series_settings";
export const COLOR_SETTING_ID = "series_settings.colors";

export const getSeriesColors = (
  seriesVizSettingsKeys: string[],
  settings: VisualizationSettings,
) => {
  const assignments = _.chain(seriesVizSettingsKeys)
    .map(key => [key, getIn(settings, [SETTING_ID, key, "color"])])
    .filter(([_key, color]) => color != null)
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
