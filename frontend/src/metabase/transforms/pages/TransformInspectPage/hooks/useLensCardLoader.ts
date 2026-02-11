import { useEffect, useState } from "react";

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
  const { lens, transform, onStatsReady, queryParams } =
    useLensContentContext();
  const { data, isLoading } = useRunInspectorQueryQuery({
    transformId: transform.id,
    lensId: lens.id,
    query: card.dataset_query,
    lensParams: queryParams,
  });
  const [stats, setStats] = useState<CardStats | null>();

  useEffect(() => {
    if (isLoading) {
      return;
    }
    const stats = computeCardStats(lens.id, card, data?.data?.rows);
    setStats(stats);
    onStatsReady(card.id, stats);
  }, [card, lens, data, isLoading, onStatsReady]);

  return { data, isLoading, stats };
};
