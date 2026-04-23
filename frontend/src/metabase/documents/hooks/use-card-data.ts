import { useMemo } from "react";

import { useGetCardQuery, useGetCardQueryQuery } from "metabase/api";
import { getMetadata } from "metabase/selectors/metadata";
import { useSelector } from "metabase/utils/redux";
import Question from "metabase-lib/v1/Question";
import type { Card, Dataset, RawSeries } from "metabase-types/api";
import { isObject } from "metabase-types/guards";

interface UseCardDataProps {
  id: number;
}

export interface UseCardDataResult {
  card?: Card;
  dataset?: Dataset;
  isLoading: boolean;
  series: RawSeries | null;
  question?: Question;
  error?: "not found" | "unknown" | null;
}

function buildSeries(card: Card, dataset: Dataset): RawSeries {
  return [
    {
      card,
      started_at: dataset.started_at,
      data: dataset.data,
    },
  ];
}

export function useCardData({ id }: UseCardDataProps): UseCardDataResult {
  const shouldSkip = !id;

  const {
    data: card,
    isLoading: isLoadingCard,
    error: cardError,
  } = useGetCardQuery({ id }, { skip: shouldSkip });

  const metadata = useSelector(getMetadata);

  const { data: dataset, isLoading: isLoadingDataset } = useGetCardQueryQuery(
    { cardId: id },
    { skip: shouldSkip || !card },
  );

  const isLoading = isLoadingCard || isLoadingDataset;

  const series = card && dataset?.data ? buildSeries(card, dataset) : null;

  const question = useMemo(
    () => (card ? new Question(card, metadata) : undefined),
    [card, metadata],
  );

  const hasTriedToLoad =
    card !== undefined || isLoadingCard || isLoadingDataset;
  const hasFailedToLoadCard = hasTriedToLoad && !isLoading && id && !card;
  const getError = () => {
    if (isObject(cardError) && cardError.status === 404) {
      return "not found";
    }
    if (hasFailedToLoadCard) {
      return "unknown";
    }
  };

  return {
    card,
    dataset,
    isLoading,
    series,
    question,
    error: getError(),
  };
}
