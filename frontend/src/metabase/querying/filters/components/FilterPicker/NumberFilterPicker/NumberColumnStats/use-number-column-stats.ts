import { useMemo, useRef } from "react";

import { skipToken, useGetPrototypeSamplesQuery } from "metabase/api";
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
  /** True when the stats come from a sample, on slow data. */
  isEstimate: boolean;
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
  /** True when too few rows of the sample match the other filters. */
  isUnavailable: boolean;
}

/** Rows of the sample below which an estimate is not reliable. */
export const MIN_SAMPLE_ROWS = 100;

export type StatsSource =
  | { type: "none" }
  | { type: "fast" }
  | {
      type: "sample";
      rowCount: number;
      sampleCount: number;
      /** The exact min and max of the number columns of the sampled table. */
      ranges: Map<number, { min: number; max: number }>;
    };

const NO_STATS: StatsSource = { type: "none" };

/**
 * Prototype: on fast data, queries on the prototype dataset get their stats
 * from the data. On slow data, a query on one table gets them from the sample
 * of that table, which Metabase makes in the background. Other queries get no
 * stats, because on slow data each query waits for seconds.
 */
export function useStatsSource(query: Lib.Query): StatsSource {
  const prototypeData = useSetting("prototype-data");
  const isSlow = useIsSlowData();
  const { data: samples } = useGetPrototypeSamplesQuery();
  return useMemo(() => {
    if (
      prototypeData == null ||
      Lib.databaseID(query) !== prototypeData.database_id
    ) {
      return NO_STATS;
    }
    const tableIds = Lib.allSourceTableIds(query);
    if (tableIds.length === 0) {
      return NO_STATS;
    }
    if (!isSlow) {
      return { type: "fast" };
    }
    // A sample joined to another sample has almost no matching rows, so only
    // a query that reads one table can use its sample.
    const sourceTableId = Lib.sourceTableOrCardId(query);
    const sample = samples?.tables.find(
      (table) => table.table_id === sourceTableId,
    );
    if (
      sample == null ||
      tableIds.length !== 1 ||
      tableIds[0] !== sourceTableId
    ) {
      return NO_STATS;
    }
    return {
      type: "sample",
      rowCount: sample.row_count,
      sampleCount: sample.sample_count,
      ranges: new Map(
        samples?.columns.map(({ field_id, min, max }) => [
          field_id,
          { min, max },
        ]),
      ),
    };
  }, [query, prototypeData, isSlow, samples]);
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
  const isSample = source.type === "sample";

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
    summaryJsQuery != null ? { query: summaryJsQuery, isSample } : skipToken,
  );
  const summaryRow = summaryDataset?.data?.rows?.[0];
  const stats = useMemo(
    () => (summaryRow != null ? parseSummaryRow(summaryRow) : null),
    [summaryRow],
  );

  // The min and the max of a sample miss the rarest values, so the slider uses
  // the exact range of the column, unless other filters make it narrower.
  const exactRange = useMemo(() => {
    if (source.type !== "sample" || base == null) {
      return undefined;
    }
    if (Lib.filters(base.query, base.stageIndex).length > 0) {
      return undefined;
    }
    const { fieldId } = Lib.fieldValuesSearchInfo(query, column);
    return fieldId != null ? source.ranges.get(fieldId) : undefined;
  }, [source, base, query, column]);
  const rangeMin = exactRange?.min ?? stats?.min;
  const rangeMax = exactRange?.max ?? stats?.max;

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
    histogramJsQuery != null
      ? { query: histogramJsQuery, isSample }
      : skipToken,
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
    const range = { min: sliderRange.min, max: sliderRange.max };
    if (source.type !== "sample") {
      return {
        stats,
        isEstimate: false,
        histogram,
        range,
        step: sliderRange.step,
      };
    }
    // Each row of the sample stands for this many rows of the table.
    const scale = source.rowCount / source.sampleCount;
    return {
      stats: {
        ...stats,
        count: Math.round(stats.count * scale),
        min: exactRange?.min ?? stats.min,
        max: exactRange?.max ?? stats.max,
        sum: stats.sum != null ? stats.sum * scale : null,
      },
      isEstimate: true,
      histogram: histogram.map((count) => count * scale),
      range,
      step: sliderRange.step,
    };
  }, [source, stats, exactRange, histogram, sliderRange]);
  const isUnavailable =
    isSample && stats != null && stats.count < MIN_SAMPLE_ROWS;

  return {
    hasStats,
    result: isUnavailable ? null : result,
    isUnavailable,
  };
}
