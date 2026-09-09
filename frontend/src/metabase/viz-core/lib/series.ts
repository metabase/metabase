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
import { isObjectWithRaw } from "metabase-types/guards";

import { SERIES_SETTING_KEY } from "../shared/settings/series";

import { withColorName } from "./color-name";

// Transformed series keep the raw series they were derived from in `_raw`.
// The transforms rebuild `data`, dropping fields such as `referenced_entities`,
// which are present only in the raw series.
export function getRawSeries(series: Series): Series {
  return isObjectWithRaw(series) && series._raw ? series._raw : series;
}

export const updateSeriesColor = (
  settings: VisualizationSettings,
  seriesKey: string,
  hexValue: string,
  colorName?: string,
) => {
  const existing = settings[SERIES_SETTING_KEY]?.[seriesKey] ?? {};

  return assocIn(
    settings,
    [SERIES_SETTING_KEY, seriesKey],
    withColorName({ ...existing, color: hexValue }, colorName),
  );
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
