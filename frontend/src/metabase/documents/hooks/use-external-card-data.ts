import { useMemo } from "react";
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

export function useExternalCardDataLoader(cardId: number): UseCardDataResult {
  const context = useExternalCardData();
  const metadata = useSelector(getMetadata);

  const card = context?.cards?.[cardId];

  const documentUuid = context?.documentUuid;
  const loadCardQuery = context?.loadCardQuery;

  const {
    value: dataset,
    loading: isLoadingDataset,
    error: datasetError,
  } = useAsync(async () => {
    if (!loadCardQuery || !cardId || !documentUuid || !card) {
      return undefined;
    }

    try {
      return await loadCardQuery(cardId);
    } catch (error) {
      console.error("Failed to load external document card data:", error);
      throw error;
    }
  }, [cardId, documentUuid, card]);

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
