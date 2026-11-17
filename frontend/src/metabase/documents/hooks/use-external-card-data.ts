import { useMemo } from "react";

import {
  skipToken,
  useGetPublicDocumentCardGoalValuesQuery,
  useGetPublicDocumentCardQueryQuery,
} from "metabase/api";
import { useQuestionFromCard } from "metabase/metadata-store";
import { useDatasetWithGoalValues } from "metabase/querying/goal-values";
import type { UseCardDataResult } from "metabase/rich_text_editing/tiptap/EditorHost";
import { getReferencedEntities } from "metabase/viz-core";
import type { Card, CardId, Dataset, RawSeries } from "metabase-types/api";

import { useExternalCardData } from "../components/editor-extensions/CardEmbed/ExternalCardDataContext";

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
  cardId: CardId,
  { skip = false }: { skip?: boolean } = {},
): UseCardDataResult {
  const context = useExternalCardData();

  const card = context?.cards?.[cardId];
  const documentUuid = context?.documentUuid;

  const shouldSkip = skip || !cardId || !card || !documentUuid;

  const {
    data: queryDataset,
    isLoading: isLoadingDataset,
    error: datasetError,
  } = useGetPublicDocumentCardQueryQuery(
    shouldSkip ? skipToken : { uuid: documentUuid, cardId },
  );

  const goalSources = useMemo(
    () => (card ? getReferencedEntities(card) : []),
    [card],
  );

  const goalValuesQuery = useGetPublicDocumentCardGoalValuesQuery(
    shouldSkip || goalSources.length === 0
      ? skipToken
      : { uuid: documentUuid, cardId },
  );

  const dataset = useDatasetWithGoalValues(
    queryDataset,
    goalSources,
    goalValuesQuery,
  );

  const question = useQuestionFromCard(card);

  if (!context) {
    return {
      isLoading: false,
      series: null,
      error: null,
    };
  }

  const isLoading = !card || isLoadingDataset || goalValuesQuery.isLoading;

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
