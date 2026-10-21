import { useMemo, useRef } from "react";

import { skipToken } from "metabase/api";
import { useSetting } from "metabase/settings";
import * as Lib from "metabase-lib";

import { useGetPrototypeStatsQueryQuery } from "./api";
import {
  BUCKET_COUNT,
  type NumberColumnStats,
  getHistogramQuery,
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
  histogram: number[];
}

interface UseNumberColumnStatsResult {
  /** True when the popover shows stats after they load. */
  isFast: boolean;
  /** The stats and the histogram, when both are loaded. */
  result: NumberColumnStatsResult | null;
}

// Prototype: stats only for queries that read the fast tables of the
// prototype dataset. A slow table makes each query wait for seconds.
function useIsFastQuery(query: Lib.Query) {
  const prototypeData = useSetting("prototype-data");
  return useMemo(() => {
    const fastTableIds = new Set(prototypeData?.fast_table_ids ?? []);
    const tableIds = Lib.allSourceTableIds(query);
    return (
      Lib.databaseID(query) === prototypeData?.database_id &&
      tableIds.length > 0 &&
      tableIds.every((tableId) => fastTableIds.has(tableId))
    );
  }, [query, prototypeData]);
}

/**
 * The query as JSON, with the same object while only `lib/uuid`s change. Each
 * build of a stats query gives its new clauses new uuids. Without this, every
 * new query object makes a new request, and in the notebook every response
 * makes a new query object.
 */
function useStableJsQuery(query: Lib.Query | null) {
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
  const isFast = useIsFastQuery(query);

  const base = useMemo(
    () => (isFast ? getStatsBase(query, stageIndex, column, filter) : null),
    [isFast, query, stageIndex, column, filter],
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

  const hasRange =
    stats?.min != null && stats?.max != null && stats.min < stats.max;
  const histogramQuery = useMemo(
    () =>
      base != null && hasRange && stats?.min != null && stats?.max != null
        ? getHistogramQuery(base, stats.min, stats.max)
        : null,
    [base, hasRange, stats?.min, stats?.max],
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

  const result = useMemo(
    () => (stats != null && histogram != null ? { stats, histogram } : null),
    [stats, histogram],
  );
  return { isFast, result };
}
