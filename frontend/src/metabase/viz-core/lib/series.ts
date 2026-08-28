import { assocIn } from "icepick";

import type {
  Card,
  Dataset,
  DatasetQuery,
  RawSeries,
  Series,
  SeriesCard,
  VisualizationDisplay,
  VisualizationSettings,
} from "metabase-types/api";

import { SERIES_SETTING_KEY } from "../shared/settings/series";

export const updateSeriesColor = (
  settings: VisualizationSettings,
  seriesKey: string,
  color: string,
) => {
  return assocIn(settings, [SERIES_SETTING_KEY, seriesKey, "color"], color);
};

export const getNameForCard = (card: SeriesCard) => {
  return card?.name || "";
};

export const getSeriesWithDisplay = (
  rawSeries: RawSeries,
  display: VisualizationDisplay,
): RawSeries =>
  rawSeries.map((series) => ({
    ...series,
    card: { ...series.card, display },
  }));

// The split series of a visualizer card get synthetic negative card ids, so they can't collide with real card ids.
// The id encodes the series position.
export function getVisualizerSeriesCardId(seriesIndex: number) {
  return -(seriesIndex + 1);
}

export function getVisualizerSeriesCardIndex(cardId?: number) {
  if (!cardId) {
    return 0;
  }
  return -cardId - 1;
}

export const createRawSeries = (options: {
  card: Card;
  queryResult: Dataset | null;
  datasetQuery?: DatasetQuery | null;
}): Series | null => {
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
