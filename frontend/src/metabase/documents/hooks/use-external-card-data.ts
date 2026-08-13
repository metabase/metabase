import { useMemo } from "react";

import { skipToken, useGetPublicDocumentCardQueryQuery } from "metabase/api";
import { useSelector } from "metabase/redux";
import type { UseCardDataResult } from "metabase/rich_text_editing/tiptap/EditorHost";
import { useExternalCardData } from "metabase/rich_text_editing/tiptap/extensions/CardEmbed/ExternalCardDataContext";
import { getMetadata } from "metabase/selectors/metadata";
import Question from "metabase-lib/v1/Question";
import type { Card, CardId, Dataset, RawSeries } from "metabase-types/api";

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
  const metadata = useSelector(getMetadata);

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
