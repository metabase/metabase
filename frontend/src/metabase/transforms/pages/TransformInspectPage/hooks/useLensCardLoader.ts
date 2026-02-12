import { useEffect, useRef, useState } from "react";

import { useRunInspectorQueryQuery } from "metabase/api";
import {
  type CardStats,
  computeCardStats,
} from "metabase-lib/transforms-inspector";
import type { InspectorCard } from "metabase-types/api";

import { useLensContentContext } from "../components/LensContent/LensContentContext";

type UseLensCardLoaderOptions = {
  card: InspectorCard;
};

export const useLensCardLoader = ({ card }: UseLensCardLoaderOptions) => {
  const {
    lens,
    transform,
    onStatsReady,
    queryParams,
    onCardStartedLoading,
    onCardLoaded,
  } = useLensContentContext();
  const { data, isLoading } = useRunInspectorQueryQuery({
    transformId: transform.id,
    lensId: lens.id,
    query: card.dataset_query,
    lensParams: queryParams.lensParams,
  });
  const [stats, setStats] = useState<CardStats | null>();

  const hasReportedStartedLoading = useRef(false);

  useEffect(() => {
    if (onCardStartedLoading && !hasReportedStartedLoading.current) {
      hasReportedStartedLoading.current = true;
      onCardStartedLoading(lens.id, card.id);
    }
  }, [lens, card.id, onCardStartedLoading]);

  useEffect(() => {
    if (isLoading) {
      return;
    }
    const stats = computeCardStats(lens.id, card, data?.data?.rows);
    setStats(stats);
    onStatsReady(card.id, stats);
    onCardLoaded(lens.id, card.id);
  }, [card, lens, data, isLoading, onStatsReady, onCardLoaded]);

  return { data, isLoading, stats };
};
