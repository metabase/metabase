import { assocIn } from "icepick";
import { VisualizationSettings } from "metabase-types/api/card";
import { settingId } from "./settings/series";

export const updateSeriesColor = (
  settings: VisualizationSettings,
  seriesKey: string,
  color: string,
) => {
  return assocIn(settings, [settingId, seriesKey, "color"], color);
};
