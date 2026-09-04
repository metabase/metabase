import { useMemo } from "react";

import { skipToken, useGetPublicDocumentCardQueryQuery } from "metabase/api";
import { useQuestionFromCard } from "metabase/metadata-store";
import type { UseCardDataResult } from "metabase/rich_text_editing/tiptap/EditorHost";
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
  const buildQuestion = useQuestionFromCard();

  const card = context?.cards?.[cardId];
  const documentUuid = context?.documentUuid;

  const shouldSkip = skip || !cardId || !card || !documentUuid;

  const {
    data: dataset,
    isLoading: isLoadingDataset,
    error: datasetError,
  } = useGetPublicDocumentCardQueryQuery(
    shouldSkip ? skipToken : { uuid: documentUuid, cardId },
  );

  const question = useMemo(
    () => (card ? buildQuestion(card) : undefined),
    [card, buildQuestion],
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
