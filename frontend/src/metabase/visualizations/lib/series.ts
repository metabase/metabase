import { assocIn } from "icepick";
import { VisualizationSettings } from "metabase-types/api/card";
import { Series } from "metabase-types/types/Visualization";
import { SETTING_ID, keyForSingleSeries } from "./settings/series";

export const updateSeriesColor = (
  settings: VisualizationSettings,
  seriesKey: string,
  color: string,
) => {
  return assocIn(settings, [SETTING_ID, seriesKey, "color"], color);
};

export const findSeriesByKey = (series: Series, key: string) => {
  return series.find(singleSeries => keyForSingleSeries(singleSeries) === key);
};
