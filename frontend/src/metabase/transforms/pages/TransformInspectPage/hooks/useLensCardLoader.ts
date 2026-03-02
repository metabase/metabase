import { useEffect, useState } from "react";

import { useRunInspectorQueryQuery } from "metabase/api";
import {
  type CardStats,
  computeCardStats,
} from "metabase/transforms/lib/transforms-inspector";
import type { InspectorCard } from "metabase-types/api";

import { useLensContentContext } from "../components/LensContent/LensContentContext";

type UseLensCardLoaderOptions = {
  card: InspectorCard;
};

export const useLensCardLoader = ({ card }: UseLensCardLoaderOptions) => {
  const {
    lensHandle,
    transform,
    onStatsReady,
    onCardStartedLoading,
    onCardLoaded,
  } = useLensContentContext();
  const { data, isLoading } = useRunInspectorQueryQuery({
    transformId: transform.id,
    lensId: lensHandle.id,
    query: card.dataset_query,
    lensParams: lensHandle.params,
  });
  const [stats, setStats] = useState<CardStats | null>();

  useEffect(() => {
    onCardStartedLoading(card.id);
  }, [card.id, onCardStartedLoading]);

  useEffect(() => {
    if (isLoading) {
      return;
    }
    const stats = computeCardStats(lensHandle.id, card, data?.data?.rows);
    setStats(stats);
    onStatsReady(card.id, stats);
    onCardLoaded(card.id);
  }, [card, lensHandle, data, isLoading, onStatsReady, onCardLoaded]);

  return { data, isLoading, stats };
};
