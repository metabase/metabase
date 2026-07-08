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
    pushNewStats,
    markCardStartedLoading,
    markCardLoaded,
  } = useLensContentContext();
  const { data, isLoading } = useRunInspectorQueryQuery({
    transformId: transform.id,
    lensId: lensHandle.id,
    query: card.dataset_query,
    lensParams: lensHandle.params,
  });
  const [stats, setStats] = useState<CardStats | null>();

  useEffect(() => {
    markCardStartedLoading(card.id);
  }, [card.id, markCardStartedLoading]);

  useEffect(() => {
    if (isLoading) {
      return;
    }
    const stats = computeCardStats(lensHandle.id, card, data?.data?.rows);
    setStats(stats);
    pushNewStats(card.id, stats);
    markCardLoaded(card.id);
  }, [card, lensHandle, data, isLoading, pushNewStats, markCardLoaded]);

  return { data, isLoading, stats };
};
