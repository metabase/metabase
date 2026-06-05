import { useCallback, useMemo, useState } from "react";

import { useMetricDefinition } from "metabase/metrics/common/hooks";
import type { MetricId } from "metabase-types/api/metric";

import { getDefaultDimensions } from "./utils";

const SHOW_MORE_BATCH_SIZE = 4;

export function useMetricDimensionCards(metricId: MetricId) {
  const { definition, isLoading } = useMetricDefinition(metricId);

  const allDimensions = useMemo(
    () => (definition ? getDefaultDimensions(definition) : []),
    [definition],
  );

  const [visibleCount, setVisibleCount] = useState<number | null>(null);

  if (definition && visibleCount === null && allDimensions.length > 0) {
    setVisibleCount(Math.min(allDimensions.length, SHOW_MORE_BATCH_SIZE));
  }

  const visibleCards = useMemo(
    () => allDimensions.slice(0, visibleCount ?? 0),
    [allDimensions, visibleCount],
  );

  const hasMore = visibleCards.length < allDimensions.length;

  const showMore = useCallback(() => {
    setVisibleCount((previous) =>
      Math.min((previous ?? 0) + SHOW_MORE_BATCH_SIZE, allDimensions.length),
    );
  }, [allDimensions.length]);

  return {
    cards: visibleCards,
    definition,
    isLoading,
    hasMore,
    showMore,
  };
}
