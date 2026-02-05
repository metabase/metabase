import { useEffect, useState } from "react";

import { useGetAdhocQueryQuery } from "metabase/api";
import {
  type CardStats,
  computeCardStats,
} from "metabase-lib/transforms-inspector";
import type { InspectorCard } from "metabase-types/api";

type UseLensCardLoaderOptions = {
  lensId: string;
  card: InspectorCard;
  onStatsReady: (cardId: string, stats: CardStats | null) => void;
};

export const useLensCardLoader = ({
  lensId,
  card,
  onStatsReady,
}: UseLensCardLoaderOptions) => {
  const { data, isLoading } = useGetAdhocQueryQuery(card.dataset_query);
  const [stats, setStats] = useState<CardStats | null>();

  useEffect(() => {
    if (isLoading) {
      return;
    }
    const stats = computeCardStats(lensId, card, data?.data?.rows);
    setStats(stats);
    onStatsReady(card.id, stats);
  }, [card, lensId, data, isLoading, onStatsReady]);

  return { data, isLoading, stats };
};
