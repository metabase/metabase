import { assocIn } from "icepick";
import { VisualizationSettings } from "metabase-types/api/card";
import { SETTING_ID } from "./settings/series";

export const updateSeriesColor = (
  settings: VisualizationSettings,
  seriesKey: string,
  color: string,
) => {
  return assocIn(settings, [SETTING_ID, seriesKey, "color"], color);
};
