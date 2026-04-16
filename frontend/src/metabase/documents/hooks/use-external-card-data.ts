import { useMemo } from "react";
import { useAsync } from "react-use";

import { getMetadata } from "metabase/selectors/metadata";
import { useSelector } from "metabase/utils/redux";
import Question from "metabase-lib/v1/Question";
import type { Card, Dataset, RawSeries } from "metabase-types/api";

import { useExternalCardData } from "../contexts/ExternalCardDataContext";

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

/**
 * Loads card data from an external source (e.g., public document).
 * Returns empty/loading state when no ExternalCardDataProvider is present.
 * Always safe to call unconditionally — uses the provider only if available.
 */
export function useExternalCardDataLoader(cardId: number): UseCardDataResult {
  const ctx = useExternalCardData();
  const metadata = useSelector(getMetadata);
  const card = ctx?.cards?.[cardId];

  const {
    value: dataset,
    loading: isLoadingDataset,
    error: datasetError,
  } = useAsync(async () => {
    if (!card || !ctx) {
      return undefined;
    }

    try {
      return await ctx.loadCardQuery(cardId);
    } catch (error) {
      console.error("Failed to load external card data:", error);
      throw error;
    }
  }, [cardId, card, ctx]);

  const isLoading = !ctx ? false : !card || isLoadingDataset;

  const hasDataForVisualization = card && dataset?.data;
  const series = hasDataForVisualization ? buildSeries(card, dataset) : null;

  const question = useMemo(
    () => (card ? new Question(card, metadata) : undefined),
    [card, metadata],
  );

  const error = datasetError
    ? "not found"
    : !ctx
      ? null
      : !card
        ? "not found"
        : null;

  return {
    card,
    dataset,
    isLoading,
    series,
    question,
    error,
  };
}
