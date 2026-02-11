import { useEffect, useState } from "react";

import { useRunInspectorQueryQuery } from "metabase/api";
import {
  type CardStats,
  computeCardStats,
} from "metabase-lib/transforms-inspector";
import type { InspectorCard } from "metabase-types/api";

import { useTransformInspectContext } from "../TransformInspectContext";

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
  const { transformId, lensParams } = useTransformInspectContext();
  const { data, isLoading } = useRunInspectorQueryQuery({
    transformId,
    lensId,
    query: card.dataset_query,
    lensParams,
  });
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
