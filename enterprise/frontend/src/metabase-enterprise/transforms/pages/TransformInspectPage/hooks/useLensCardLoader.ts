import { useEffect, useMemo } from "react";

import { useGetAdhocQueryQuery } from "metabase/api";
import type { DatasetQuery, InspectorCard } from "metabase-types/api";

import type { CardStats } from "../types";

type UseLensCardLoaderResult = {
  isLoading: boolean;
  stats: CardStats | null;
  isDegenerate: boolean;
  degenerateReason: string | null;
  data: unknown;
};

const extractStats = (
  data: { data?: { rows?: unknown[][] } } | undefined,
): CardStats | null => {
  if (!data?.data?.rows) {
    return null;
  }
  const rows = data.data.rows;
  return {
    rowCount: rows.length,
    firstRow: rows[0],
  };
};

export const useLensCardLoader = (
  card: InspectorCard,
  cardSummaries: Record<string, CardStats>,
  onStatsReady: (cardId: string, stats: CardStats) => void,
): UseLensCardLoaderResult => {
  const { data, isLoading } = useGetAdhocQueryQuery(
    card.dataset_query as DatasetQuery,
  );

  const stats = useMemo(() => extractStats(data), [data]);

  // TODO: implement degeneracy check
  const { isDegenerate, degenerateReason } = useMemo(() => {
    return { isDegenerate: false, degenerateReason: null };
  }, []);

  useEffect(() => {
    if (stats) {
      onStatsReady(card.id, stats);
    }
  }, [stats, card.id, onStatsReady]);

  return {
    isLoading,
    stats,
    isDegenerate,
    degenerateReason,
    data,
  };
};
