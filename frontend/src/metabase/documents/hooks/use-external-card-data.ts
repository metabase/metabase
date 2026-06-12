import { useMemo } from "react";

import { skipToken, useGetPublicDocumentCardQueryQuery } from "metabase/api";
import { useExternalCardData } from "metabase/documents/contexts/ExternalCardDataContext";
import { useSelector } from "metabase/redux";
import { getMetadata } from "metabase/selectors/metadata";
import Question from "metabase-lib/v1/Question";
import type { Card, CardId, Dataset, RawSeries } from "metabase-types/api";

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

export function useExternalCardDataLoader(
  cardId: CardId | null | undefined,
  { skip = false }: { skip?: boolean } = {},
): UseCardDataResult {
  const context = useExternalCardData();
  const metadata = useSelector(getMetadata);

  const card = cardId != null ? context?.cards?.[cardId] : undefined;
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
