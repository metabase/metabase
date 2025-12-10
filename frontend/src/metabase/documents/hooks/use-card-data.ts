import { useMemo } from "react";

import { skipToken, useGetCardQuery, useGetCardQueryQuery } from "metabase/api";
import {
  useGetAdhocPivotQueryQuery,
  useGetAdhocQueryQuery,
} from "metabase/api/dataset";
import { useSelector } from "metabase/lib/redux";
import { getMetadata } from "metabase/selectors/metadata";
import Question from "metabase-lib/v1/Question";
import { getPivotOptions } from "metabase-lib/v1/queries/utils/pivot";
import type { Card, Dataset, RawSeries } from "metabase-types/api";
import { isObject } from "metabase-types/guards";

import { getCardWithDraft } from "../selectors";

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
  draftCard?: Card;
  regularDataset?: Dataset;
}

function buildAdhocQueryParams(card: Card) {
  return {
    ...card.dataset_query,
    database: card.database_id ?? null,
    parameters: [],
  };
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

export function useCardData({ id }: UseCardDataProps): UseCardDataResult {
  const isDraft = id < 0;
  const shouldSkipSavedCard = !id || isDraft;

  const {
    data: card,
    isLoading: isLoadingCard,
    error: cardError,
  } = useGetCardQuery({ id }, { skip: shouldSkipSavedCard });

  const cardWithDraft = useSelector((state) =>
    getCardWithDraft(state, id, card),
  );

  const cardToUse = cardWithDraft ?? card;

  const metadata = useSelector(getMetadata);

  const isPivotTable = cardToUse?.display === "pivot";

  const pivotOptions = useMemo(() => {
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

  const shouldSkipRegularQuery = !id || isDraft || !card;
  const canQueryDraftCard = isDraft && cardToUse?.dataset_query;
  const shouldQueryDraftNonPivot = canQueryDraftCard && !isPivotTable;
  const shouldQueryDraftPivot = canQueryDraftCard && isPivotTable && metadata;

  const { data: regularDataset, isLoading: isLoadingRegularDataset } =
    useGetCardQueryQuery({ cardId: id }, { skip: shouldSkipRegularQuery });

  const { data: draftDataset, isLoading: isLoadingDraftDataset } =
    useGetAdhocQueryQuery(
      shouldQueryDraftNonPivot ? buildAdhocQueryParams(cardToUse) : skipToken,
    );

  const { data: draftPivotDataset, isLoading: isLoadingDraftPivotDataset } =
    useGetAdhocPivotQueryQuery(
      shouldQueryDraftPivot
        ? {
            ...buildAdhocQueryParams(cardToUse),
            ...(pivotOptions || {}),
          }
        : skipToken,
    );

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

  const hasDataForVisualization = cardToUse && dataset?.data;
  const series = hasDataForVisualization
    ? buildSeries(cardToUse, dataset)
    : null;

  const question = useMemo(
    () => (cardToUse ? new Question(cardToUse, metadata) : undefined),
    [cardToUse, metadata],
  );

  const hasTriedToLoad =
    cardToUse !== undefined || isLoadingCard || isLoadingDataset;
  const hasFailedToLoadCard = hasTriedToLoad && !isLoading && id && !cardToUse;
  const getError = () => {
    if (isObject(cardError) && cardError.status === 404) {
      return "not found";
    }
    if (hasFailedToLoadCard) {
      return "unknown";
    }
  };
  const error = getError();

  return {
    card: cardToUse,
    dataset,
    isLoading,
    series,
    question,
    error,
    draftCard: isDraft ? cardToUse : undefined,
    regularDataset,
  };
}
