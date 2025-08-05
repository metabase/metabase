import { useMemo } from "react";

import { cardApi, skipToken } from "metabase/api";
import { useGetAdhocQueryQuery } from "metabase/api/dataset";
import { getMetadata } from "metabase/selectors/metadata";
import Question from "metabase-lib/v1/Question";

import { useDocumentsSelector } from "../redux-utils";
import { getDraftCardById } from "../selectors";

/**
 * Hook that handles the complex conditional fetching of cards and datasets
 * based on whether we're dealing with a draft card or regular card.
 *
 * Preserves the exact behavior from EmbedQuestionSettingsSidebar.
 */
export function useCardWithDataset(cardId: number) {
  const metadata = useDocumentsSelector(getMetadata);

  // Determine whether we're dealing with a draft card
  const isDraftCard = cardId < 0;

  // Check for draft card using the cardId (might be negative)
  const draftCard = useDocumentsSelector((state) =>
    getDraftCardById(state, cardId),
  );

  // Only fetch card data if this is NOT a draft card
  const { data: card, isLoading: isCardLoading } = cardApi.useGetCardQuery(
    { id: cardId },
    { skip: isDraftCard }, // Skip if this is a draft card
  );

  // Use different endpoints for draft vs regular cards
  const { data: regularDataset, isLoading: isRegularDatasetLoading } =
    cardApi.useGetCardQueryQuery(
      { cardId: cardId },
      { skip: isDraftCard || !card }, // Skip if draft card or no regular card loaded
    );

  const { data: draftDataset, isLoading: isDraftDatasetLoading } =
    useGetAdhocQueryQuery(
      draftCard?.dataset_query
        ? {
            ...draftCard.dataset_query,
            database: draftCard.database_id ?? null,
            parameters: [],
          }
        : skipToken,
    );

  // Use appropriate dataset based on whether we have a draft
  const dataset = draftCard ? draftDataset : regularDataset;
  const isResultsLoading = draftCard
    ? isDraftDatasetLoading
    : isRegularDatasetLoading;

  // Use draft card if available, otherwise use fetched card
  const cardWithDraft = draftCard || card;

  const series = useMemo(() => {
    return cardWithDraft && dataset?.data
      ? [
          {
            card: cardWithDraft,
            started_at: dataset.started_at,
            data: dataset.data,
          },
        ]
      : null;
  }, [cardWithDraft, dataset]);

  const question = useMemo(
    () => (cardWithDraft ? new Question(cardWithDraft, metadata) : undefined),
    [cardWithDraft, metadata],
  );

  return {
    cardWithDraft,
    dataset,
    isResultsLoading,
    series,
    question,
    isCardLoading,
    draftCard,
    card,
    regularDataset,
  };
}
