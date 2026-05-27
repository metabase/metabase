import { useEffect, useMemo, useState } from "react";

import { useExternalCardData } from "metabase/documents/contexts/ExternalCardDataContext";
import { useSelector } from "metabase/redux";
import { getMetadata } from "metabase/selectors/metadata";
import Question from "metabase-lib/v1/Question";
import type { Card, Dataset, RawSeries } from "metabase-types/api";

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
  cardId: number,
  { skip = false }: { skip?: boolean } = {},
): UseCardDataResult {
  const context = useExternalCardData();
  const metadata = useSelector(getMetadata);

  const card = context?.cards?.[cardId];

  const documentUuid = context?.documentUuid;
  const loadCardQuery = context?.loadCardQuery;

  // Fetch once and cache. Unlike the regular hook, which gets dedup/caching
  // for free from RTK Query, the public path uses a raw promise factory —
  // so without this, scrolling a card out of and back into the viewport
  // would re-issue the request every time.
  const [dataset, setDataset] = useState<Dataset | undefined>(undefined);
  const [datasetError, setDatasetError] = useState<unknown>(undefined);
  const [isLoadingDataset, setIsLoadingDataset] = useState(false);

  useEffect(() => {
    if (dataset || skip || !loadCardQuery || !card || !documentUuid) {
      return;
    }
    let cancelled = false;
    const load = async () => {
      setIsLoadingDataset(true);
      try {
        const result = await loadCardQuery(cardId);
        if (!cancelled) {
          setDataset(result);
        }
      } catch (error) {
        if (!cancelled) {
          console.error("Failed to load external document card data:", error);
          setDatasetError(error);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingDataset(false);
        }
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [dataset, skip, loadCardQuery, cardId, card, documentUuid]);

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
