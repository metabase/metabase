import { assocIn } from "icepick";

import { settingId } from "./settings/series";

export const updateSeriesColor = (settings, seriesKey, color) => {
  return assocIn(settings, [settingId, seriesKey, "color"], color);
};
