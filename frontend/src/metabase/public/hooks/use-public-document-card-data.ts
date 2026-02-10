import { useMemo } from "react";
import { useAsync } from "react-use";

import { useSelector } from "metabase/lib/redux";
import { usePublicDocumentContext } from "metabase/public/contexts/PublicDocumentContext";
import { getMetadata } from "metabase/selectors/metadata";
import { PublicApi } from "metabase/services";
import Question from "metabase-lib/v1/Question";
import type { Card, Dataset, RawSeries } from "metabase-types/api";

interface UsePublicDocumentCardDataProps {
  cardId: number;
  documentUuid: string;
}

interface UsePublicDocumentCardDataResult {
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

export function usePublicDocumentCardData({
  cardId,
  documentUuid,
}: UsePublicDocumentCardDataProps): UsePublicDocumentCardDataResult {
  const { publicDocumentCards } = usePublicDocumentContext();
  const metadata = useSelector(getMetadata);

  // Get the card metadata from the document response — we hydrate all cards upfront so the frontend
  // doesn't have to make authenticated requests to fetch them individually
  const card = publicDocumentCards?.[cardId];

  const {
    value: dataset,
    loading: isLoadingDataset,
    error: datasetError,
  } = useAsync(async () => {
    if (!cardId || !documentUuid || !card) {
      return undefined;
    }

    try {
      const result = await PublicApi.documentCardQuery({
        uuid: documentUuid,
        cardId,
      });
      return result as Dataset;
    } catch (error) {
      console.error("Failed to load public document card data:", error);
      throw error;
    }
  }, [cardId, documentUuid, card]);

  const isLoading = !card || isLoadingDataset;

  const hasDataForVisualization = card && dataset?.data;
  const series = hasDataForVisualization ? buildSeries(card, dataset) : null;

  const question = useMemo(
    () => (card ? new Question(card, metadata) : undefined),
    [card, metadata],
  );

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
