import { assocIn } from "icepick";

import { SERIES_SETTING_KEY } from "metabase/visualizations/shared/settings/series";
import type { Series } from "metabase-types/api";
import type { Card, VisualizationSettings } from "metabase-types/api/card";

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

export const createRawSeries = (options: {
  card: Card;
  queryResult: any;
  datasetQuery?: any;
}): Series => {
  const { card, queryResult, datasetQuery } = options;

  // we want to provide the visualization with a card containing the latest
  // "display", "visualization_settings", etc, (to ensure the correct visualization is shown)
  // BUT the last executed "dataset_query" (to ensure data matches the query)
  return (
    queryResult && [
      {
        ...queryResult,
        card: {
          ...card,
          ...(datasetQuery && { dataset_query: datasetQuery }),
        },
      },
    ]
  );
};
