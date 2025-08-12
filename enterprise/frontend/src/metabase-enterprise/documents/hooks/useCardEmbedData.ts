import { useMemo } from "react";

import { skipToken, useGetCardQuery, useGetCardQueryQuery } from "metabase/api";
import {
  useGetAdhocPivotQueryQuery,
  useGetAdhocQueryQuery,
} from "metabase/api/dataset";
import { getMetadata } from "metabase/selectors/metadata";
import Question from "metabase-lib/v1/Question";
import { getPivotOptions } from "metabase-lib/v1/queries/utils/pivot";
import type { Card, Dataset, RawSeries } from "metabase-types/api";

import { useDocumentsSelector } from "../redux-utils";
import { getCardWithDraft } from "../selectors";

interface UseCardEmbedDataProps {
  id: number;
}

interface UseCardEmbedDataResult {
  card?: Card;
  dataset?: Dataset;
  isLoading: boolean;
  rawSeries: RawSeries[] | null;
  error?: string | null;
}

// Helper functions
function buildAdhocQueryParams(card: Card) {
  return {
    ...card.dataset_query,
    database: card.database_id ?? null,
    parameters: [],
  };
}

function buildRawSeries(card: Card, dataset: Dataset): RawSeries[] {
  return [
    {
      card,
      started_at: dataset.started_at,
      data: dataset.data,
    },
  ];
}

function selectDataset(
  isDraft: boolean,
  isPivot: boolean,
  regularDataset?: Dataset,
  draftDataset?: Dataset,
  draftPivotDataset?: Dataset,
): Dataset | undefined {
  if (!isDraft) {
    return regularDataset;
  }

  if (isPivot) {
    return draftPivotDataset;
  }

  return draftDataset;
}

function selectIsLoadingDataset(
  isDraft: boolean,
  isPivot: boolean,
  isLoadingRegular: boolean,
  isLoadingDraft: boolean,
  isLoadingDraftPivot: boolean,
): boolean {
  if (!isDraft) {
    return isLoadingRegular;
  }

  if (isPivot) {
    return isLoadingDraftPivot;
  }

  return isLoadingDraft;
}

export function useCardEmbedData({
  id,
}: UseCardEmbedDataProps): UseCardEmbedDataResult {
  const isDraft = id < 0;
  const shouldSkipSavedCard = !id || isDraft;

  // Fetch the card if it's a saved card
  const { data: card, isLoading: isLoadingCard } = useGetCardQuery(
    { id },
    { skip: shouldSkipSavedCard },
  );

  // Get card with draft if available
  const cardWithDraft = useDocumentsSelector((state) =>
    getCardWithDraft(state, id, card),
  );

  // Use the draft card if available, otherwise use the fetched card
  const cardToUse = cardWithDraft ?? card;

  const metadata = useDocumentsSelector(getMetadata);

  // Check if this is a pivot table
  const isPivotTable = cardToUse?.display === "pivot";

  // Calculate pivot options for ad-hoc pivot tables (when metadata is available)
  const pivotOptions = useMemo(() => {
    // Only calculate for draft pivot tables that need client-side options
    if (!isDraft || !isPivotTable || !cardToUse || !metadata) {
      return null;
    }

    try {
      const question = new Question(cardToUse, metadata);
      return getPivotOptions(question);
    } catch (error) {
      return null;
    }
  }, [isDraft, isPivotTable, cardToUse, metadata]);

  // Query conditions
  const shouldSkipRegularQuery = !id || isDraft || !card;
  const canQueryDraftCard = isDraft && cardToUse?.dataset_query;
  const shouldQueryDraftNonPivot = canQueryDraftCard && !isPivotTable;
  // For pivot tables, we need metadata to calculate options
  const shouldQueryDraftPivot = canQueryDraftCard && isPivotTable && metadata;

  // Use different endpoints for saved vs draft cards
  const { data: regularDataset, isLoading: isLoadingRegularDataset } =
    useGetCardQueryQuery({ cardId: id }, { skip: shouldSkipRegularQuery });

  // For draft cards, use the appropriate endpoint based on display type
  const { data: draftDataset, isLoading: isLoadingDraftDataset } =
    useGetAdhocQueryQuery(
      shouldQueryDraftNonPivot ? buildAdhocQueryParams(cardToUse) : skipToken,
    );

  // For ad-hoc pivot tables, include calculated pivot options
  const { data: draftPivotDataset, isLoading: isLoadingDraftPivotDataset } =
    useGetAdhocPivotQueryQuery(
      shouldQueryDraftPivot
        ? {
            ...buildAdhocQueryParams(cardToUse),
            ...(pivotOptions || {}),
          }
        : skipToken,
    );

  // Select the appropriate dataset and loading state
  const dataset = selectDataset(
    isDraft,
    isPivotTable,
    regularDataset,
    draftDataset,
    draftPivotDataset,
  );

  const isLoadingDataset = selectIsLoadingDataset(
    isDraft,
    isPivotTable,
    isLoadingRegularDataset,
    isLoadingDraftDataset,
    isLoadingDraftPivotDataset,
  );

  const isLoading = isLoadingCard || isLoadingDataset;

  // Build raw series for visualization
  const hasDataForVisualization = cardToUse && dataset?.data;
  const rawSeries = hasDataForVisualization
    ? buildRawSeries(cardToUse, dataset)
    : null;

  // Error handling
  const hasTriedToLoad =
    cardToUse !== undefined || isLoadingCard || isLoadingDataset;
  const hasFailedToLoadCard = hasTriedToLoad && !isLoading && id && !cardToUse;
  const error = hasFailedToLoadCard ? "Failed to load question" : null;

  return {
    card: cardToUse,
    dataset,
    isLoading,
    rawSeries,
    error,
  };
}
