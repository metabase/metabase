import { useMemo, useRef } from "react";

import { skipToken } from "metabase/api";
import { useIsSlowData } from "metabase/prototype";
import { useSetting } from "metabase/settings";
import * as Lib from "metabase-lib";

import { useGetPrototypeStatsQueryQuery } from "./api";
import {
  BUCKET_COUNT,
  type NumberColumnStats,
  getHistogramQuery,
  getSliderRange,
  getSliderStep,
  getStatsBase,
  getSummaryQuery,
  parseHistogramRows,
  parseSummaryRow,
} from "./utils";

interface UseNumberColumnStatsProps {
  query: Lib.Query;
  stageIndex: number;
  column: Lib.ColumnMetadata;
  filter: Lib.Filterable | undefined;
}

export interface NumberColumnStatsResult {
  stats: NumberColumnStats;
  /** Row counts in equal buckets from `range.min` to `range.max`. */
  histogram: number[];
  /** Bounds of the slider and the histogram. */
  range: { min: number; max: number };
  step: number;
}

interface UseNumberColumnStatsResult {
  /** True when the popover shows stats after they load. */
  hasStats: boolean;
  /** The stats and the histogram, when both are loaded. */
  result: NumberColumnStatsResult | null;
}

export type StatsSource = { type: "none" } | { type: "fast" };

const NO_STATS: StatsSource = { type: "none" };

/**
 * Prototype: on fast data, queries on the prototype dataset get their stats
 * from the data. Slow data gets no stats, because each query waits for
 * seconds.
 */
export function useStatsSource(query: Lib.Query): StatsSource {
  const prototypeData = useSetting("prototype-data");
  const isSlow = useIsSlowData();
  return useMemo(() => {
    if (
      isSlow ||
      prototypeData == null ||
      Lib.databaseID(query) !== prototypeData.database_id ||
      Lib.allSourceTableIds(query).length === 0
    ) {
      return NO_STATS;
    }
    return { type: "fast" };
  }, [query, prototypeData, isSlow]);
}

/**
 * The query as JSON, with the same object while only `lib/uuid`s change. Each
 * build of a stats query gives its new clauses new uuids. Without this, every
 * new query object makes a new request, and in the notebook every response
 * makes a new query object.
 */
export function useStableJsQuery(query: Lib.Query | null) {
  const ref = useRef<{
    key: string;
    jsQuery: ReturnType<typeof Lib.toJsQuery>;
  } | null>(null);
  if (query == null) {
    return null;
  }
  const jsQuery = Lib.toJsQuery(query);
  const key = JSON.stringify(jsQuery, (key, value) =>
    key === "lib/uuid" ? undefined : value,
  );
  if (ref.current?.key !== key) {
    ref.current = { key, jsQuery };
  }
  return ref.current.jsQuery;
}

export function useNumberColumnStats({
  query,
  stageIndex,
  column,
  filter,
}: UseNumberColumnStatsProps): UseNumberColumnStatsResult {
  const source = useStatsSource(query);
  const hasStats = source.type !== "none";

  const base = useMemo(
    () => (hasStats ? getStatsBase(query, stageIndex, column, filter) : null),
    [hasStats, query, stageIndex, column, filter],
  );
  const summaryQuery = useMemo(
    () => (base != null ? getSummaryQuery(base) : null),
    [base],
  );
  const summaryJsQuery = useStableJsQuery(summaryQuery);
  const { data: summaryDataset } = useGetPrototypeStatsQueryQuery(
    summaryJsQuery ?? skipToken,
  );
  const summaryRow = summaryDataset?.data?.rows?.[0];
  const stats = useMemo(
    () => (summaryRow != null ? parseSummaryRow(summaryRow) : null),
    [summaryRow],
  );

  const rangeMin = stats?.min;
  const rangeMax = stats?.max;

  const hasRange = rangeMin != null && rangeMax != null && rangeMin < rangeMax;
  const isInteger = Lib.isInteger(column);
  const sliderRange = useMemo(() => {
    if (rangeMin == null || rangeMax == null) {
      return null;
    }
    const step = getSliderStep(rangeMin, rangeMax, isInteger);
    return { ...getSliderRange(rangeMin, rangeMax, step), step };
  }, [rangeMin, rangeMax, isInteger]);
  const histogramQuery = useMemo(
    () =>
      base != null && hasRange && sliderRange != null
        ? getHistogramQuery(base, sliderRange.min, sliderRange.max)
        : null,
    [base, hasRange, sliderRange],
  );
  const histogramJsQuery = useStableJsQuery(histogramQuery);
  const { data: histogramDataset } = useGetPrototypeStatsQueryQuery(
    histogramJsQuery ?? skipToken,
  );

  const histogram = useMemo(() => {
    if (stats == null) {
      return undefined;
    }
    if (!hasRange) {
      // One value or no values: all the rows go in the first bucket.
      const counts = new Array(BUCKET_COUNT).fill(0);
      counts[0] = stats.count;
      return counts;
    }
    return histogramDataset?.data?.rows != null
      ? parseHistogramRows(histogramDataset.data.rows)
      : undefined;
  }, [stats, hasRange, histogramDataset]);

  const result = useMemo(() => {
    if (stats == null || histogram == null || sliderRange == null) {
      return null;
    }
    return {
      stats,
      histogram,
      range: { min: sliderRange.min, max: sliderRange.max },
      step: sliderRange.step,
    };
  }, [stats, histogram, sliderRange]);

  return { hasStats, result };
}
