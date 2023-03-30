import { assocIn } from "icepick";
import { VisualizationSettings, Card } from "metabase-types/api/card";
import { Series, TransformedSeries } from "metabase-types/api/dataset";
import { isNotNull } from "metabase/core/utils/types";
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

export const getOrderedSeries = (
  series: Series,
  settings: VisualizationSettings,
  isReversed?: boolean,
) => {
  if (
    (settings["graph.dimensions"] &&
      settings["graph.dimensions"].length <= 1) ||
    !settings["graph.series_order"]
  ) {
    return series;
  }

  const orderedSeries = settings["graph.series_order"]
    ?.filter(orderedItem => orderedItem.enabled)
    .map(orderedItem => findSeriesByKey(series, orderedItem.key))
    .filter(isNotNull);

  if (isReversed) {
    orderedSeries.reverse();
  }

  if ("_raw" in series) {
    const transformedOrderedSeries = [...orderedSeries] as TransformedSeries;
    transformedOrderedSeries._raw = series._raw;
    return transformedOrderedSeries;
  }

  return orderedSeries;
};

export const getNameForCard = (card: Card) => {
  return card?.name || "";
};
