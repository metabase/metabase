import { assocIn } from "icepick";

import { SERIES_SETTING_KEY } from "metabase/visualizations/shared/settings/series";
import type { VisualizationSettings, Card } from "metabase-types/api/card";

export const updateSeriesColor = (
  settings: VisualizationSettings,
  seriesKey: string,
  color: string,
) => {
  return assocIn(settings, [SERIES_SETTING_KEY, seriesKey, "color"], color);
};

export const getNameForCard = (card: Card) => {
  return card?.name || "";
};
