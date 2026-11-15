import { useCallback, useEffect, useMemo, useState } from "react";

import { useMetricDefinition } from "metabase/metrics/common/hooks";
import type { MetricDimension, MetricId } from "metabase-types/api/metric";

import { type OverviewDimension, getOverviewDimensions } from "./utils";

const INITIAL_VISIBLE_COUNT = 4;
const AUTO_LOAD_VISIBLE_COUNT = 10;
const SHOW_MORE_BATCH_SIZE = 4;

export function useMetricDimensionCards(
  metricId: MetricId,
  dimensions: MetricDimension[],
) {
  const { definition, isLoading } = useMetricDefinition(metricId);

  const allDimensions = useMemo(
    () => (definition ? getOverviewDimensions(definition, dimensions) : []),
    [definition, dimensions],
  );
  const visibility = useVisibleDimensions(allDimensions, metricId);

  return {
    ...visibility,
    definition,
    isLoading,
  };
}

export function useVisibleDimensions(
  dimensions: OverviewDimension[],
  metricId: MetricId,
) {
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_COUNT);

  useEffect(() => {
    setVisibleCount(INITIAL_VISIBLE_COUNT);
  }, [metricId]);

  const visibleCards = useMemo(
    () => dimensions.slice(0, visibleCount),
    [dimensions, visibleCount],
  );

  const hasMore = visibleCards.length < dimensions.length;
  const canAutoLoad =
    visibleCards.length < Math.min(dimensions.length, AUTO_LOAD_VISIBLE_COUNT);

  const autoLoad = useCallback(() => {
    setVisibleCount((previous) =>
      Math.max(previous, Math.min(AUTO_LOAD_VISIBLE_COUNT, dimensions.length)),
    );
  }, [dimensions.length]);

  const showMore = useCallback(() => {
    setVisibleCount((previous) =>
      Math.min(previous + SHOW_MORE_BATCH_SIZE, dimensions.length),
    );
  }, [dimensions.length]);

  return {
    cards: visibleCards,
    autoLoad,
    canAutoLoad,
    hasMore,
    showMore,
  };
}
