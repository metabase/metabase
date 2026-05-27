import { useMemo, useRef } from "react";
import { useAsync } from "react-use";

import { useExternalCardData } from "metabase/documents/contexts/ExternalCardDataContext";
import { useSelector } from "metabase/redux";
import { getMetadata } from "metabase/selectors/metadata";
import Question from "metabase-lib/v1/Question";
import type { Card, Dataset, RawSeries } from "metabase-types/api";

import type { UseCardDataResult } from "./use-card-data";

function buildSeries(card: Card, dataset: Dataset): RawSeries {
  return [
    {
      card,
      started_at: dataset.started_at,
      data: dataset.data,
    },
  ];
}

export function useExternalCardDataLoader(
  cardId: number,
  { skip = false }: { skip?: boolean } = {},
): UseCardDataResult {
  const context = useExternalCardData();
  const metadata = useSelector(getMetadata);

  const card = context?.cards?.[cardId];

  const documentUuid = context?.documentUuid;
  const loadCardQuery = context?.loadCardQuery;

  // The regular hook gets dedup/caching for free from RTK Query. The public
  // path uses a raw promise factory, so we cache the result here to keep
  // scrolling a card out of and back into the viewport from re-issuing the
  // request.
  const cacheRef = useRef<{ cardId: number; dataset: Dataset } | undefined>(
    undefined,
  );
  const cachedDataset =
    cacheRef.current?.cardId === cardId ? cacheRef.current.dataset : undefined;

  const {
    value,
    loading: rawIsLoading,
    error: datasetError,
  } = useAsync(async () => {
    if (cacheRef.current?.cardId === cardId) {
      return cacheRef.current.dataset;
    }
    if (!loadCardQuery || !cardId || !documentUuid || !card || skip) {
      return undefined;
    }

    try {
      const result = await loadCardQuery(cardId);
      cacheRef.current = { cardId, dataset: result };
      return result;
    } catch (error) {
      console.error("Failed to load external document card data:", error);
      throw error;
    }
  }, [cardId, documentUuid, card, skip]);

  const dataset = value ?? cachedDataset;
  const isLoadingDataset = !dataset && rawIsLoading;

  const question = useMemo(
    () => (card ? new Question(card, metadata) : undefined),
    [card, metadata],
  );

  if (!context) {
    return {
      isLoading: false,
      series: null,
      error: null,
    };
  }

  const isLoading = !card || isLoadingDataset;

  const hasDataForVisualization = card && dataset?.data;
  const series = hasDataForVisualization ? buildSeries(card, dataset) : null;

  const error = datasetError ? "not found" : !card ? "not found" : null;

  return {
    card,
    dataset,
    isLoading,
    series,
    question,
    error,
  };
}
