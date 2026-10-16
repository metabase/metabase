import { useMemo } from "react";

import { skipToken, useGetCardQuery, useGetCardQueryQuery } from "metabase/api";
import {
  useGetAdhocPivotQueryQuery,
  useGetAdhocQueryQuery,
} from "metabase/api/dataset";
import { useQuestionFromCardBuilder } from "metabase/metadata-store";
import { useSelector } from "metabase/redux";
import type {
  CardDataError,
  UseCardDataResult,
} from "metabase/rich_text_editing/tiptap/EditorHost";
import { is403Error, isResourceNotFoundError } from "metabase/utils/errors";
import { getPivotOptions } from "metabase-lib/v1/queries/utils/pivot-options";
import type {
  Card,
  Dataset,
  RawSeries,
  StoredResultSort,
} from "metabase-types/api";

import { getCardWithDraft, getDraftCardOriginalId } from "../selectors";

interface UseCardDataProps {
  id: number;
  skip?: boolean;
  storedResultId?: number; // When set, the embed renders in static mode: data is pulled from the cached `stored_result` snapshot
  storedResultSort?: StoredResultSort; // Sort to apply in-memory when reading a static snapshot. Static-mode only
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

function selectForQueryKind<T>(
  isDraft: boolean,
  isPivot: boolean,
  regular: T,
  draft: T,
  draftPivot: T,
): T {
  if (!isDraft) {
    return regular;
  }

  if (isPivot) {
    return draftPivot;
  }

  return draft;
}

function getRequestError(error: unknown): CardDataError | null {
  if (error == null) {
    return null;
  }
  if (is403Error(error)) {
    return "forbidden";
  }
  if (isResourceNotFoundError(error)) {
    return "not found";
  }
  return "unknown";
}

export function useCardData({
  id,
  skip = false,
  storedResultId,
  storedResultSort,
}: UseCardDataProps): UseCardDataResult {
  const isDraft = id < 0;
  const shouldSkipSavedCard = !id || isDraft || skip;

  const {
    data: card,
    isLoading: isLoadingCard,
    error: cardError,
  } = useGetCardQuery(
    // A card the user cannot read is this embed's error state, not the page's
    { id, ignore_error: true },
    { skip: shouldSkipSavedCard },
  );

  const cardWithDraft = useSelector((state) =>
    getCardWithDraft(state, id, card),
  );
  const originalCardId = useSelector((state) =>
    getDraftCardOriginalId(state, id),
  );

  const cardToUse = cardWithDraft ?? card;

  const buildQuestion = useQuestionFromCardBuilder();

  const isPivotTable = cardToUse?.display === "pivot";

  const shouldUseDraftQuery = isDraft && storedResultId == null;
  const queryCardId =
    storedResultId != null && originalCardId != null ? originalCardId : id;
  const shouldSkipRegularQuery =
    !queryCardId || queryCardId < 0 || shouldUseDraftQuery || skip;
  const canQueryDraftCard =
    shouldUseDraftQuery && cardToUse?.dataset_query && !skip;
  const shouldQueryDraftNonPivot = canQueryDraftCard && !isPivotTable;
  const shouldQueryDraftPivot = canQueryDraftCard && isPivotTable;

  const pivotOptions = useMemo(() => {
    if (!shouldUseDraftQuery || !isPivotTable || !cardToUse) {
      return null;
    }

    try {
      const question = buildQuestion(cardToUse);
      return getPivotOptions(question);
    } catch (error) {
      return null;
    }
  }, [shouldUseDraftQuery, isPivotTable, cardToUse, buildQuestion]);

  const {
    data: regularDataset,
    isLoading: isLoadingRegularDataset,
    error: regularDatasetError,
  } = useGetCardQueryQuery(
    {
      cardId: queryCardId,
      ...(storedResultId != null
        ? { stored_result_id: storedResultId, sort: storedResultSort }
        : {}),
    },
    { skip: shouldSkipRegularQuery },
  );

  const {
    data: draftDataset,
    isLoading: isLoadingDraftDataset,
    error: draftDatasetError,
  } = useGetAdhocQueryQuery(
    shouldQueryDraftNonPivot ? buildAdhocQueryParams(cardToUse) : skipToken,
  );

  const {
    data: draftPivotDataset,
    isLoading: isLoadingDraftPivotDataset,
    error: draftPivotDatasetError,
  } = useGetAdhocPivotQueryQuery(
    shouldQueryDraftPivot
      ? {
          ...buildAdhocQueryParams(cardToUse),
          ...(pivotOptions || {}),
        }
      : skipToken,
  );

  const dataset = selectForQueryKind(
    shouldUseDraftQuery,
    isPivotTable,
    regularDataset,
    draftDataset,
    draftPivotDataset,
  );

  const isLoadingDataset = selectForQueryKind(
    shouldUseDraftQuery,
    isPivotTable,
    isLoadingRegularDataset,
    isLoadingDraftDataset,
    isLoadingDraftPivotDataset,
  );

  const datasetError = selectForQueryKind(
    shouldUseDraftQuery,
    isPivotTable,
    regularDatasetError,
    draftDatasetError,
    draftPivotDatasetError,
  );

  const isLoading = isLoadingCard || isLoadingDataset;

  const hasDataForVisualization = cardToUse && dataset?.data;
  const series = hasDataForVisualization
    ? buildSeries(cardToUse, dataset)
    : null;

  const question = useMemo(
    () => (cardToUse ? buildQuestion(cardToUse) : undefined),
    [cardToUse, buildQuestion],
  );

  const error = getRequestError(cardError) ?? getRequestError(datasetError);

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
