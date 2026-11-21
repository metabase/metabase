import { useMemo } from "react";

import { skipToken } from "metabase/api";
import type * as Lib from "metabase-lib";

import { useGetPrototypeStatsQueryQuery } from "./api";
import {
  MIN_SAMPLE_MATCHES,
  MIN_SAMPLE_ROWS,
  type NumberMatchCount,
  useStableJsQuery,
  useStatsSource,
} from "./use-number-column-stats";
import {
  getStatsBase,
  getValueCountsQuery,
  parseValueCountRows,
} from "./utils";

interface UseValueCountsProps {
  query: Lib.Query;
  stageIndex: number;
  column: Lib.ColumnMetadata;
  filter: Lib.Filterable | undefined;
  /** False to skip the query, like for a column with many values. */
  isEnabled: boolean;
}

export type ValueCounts =
  | { type: "none" }
  | { type: "unavailable" }
  | {
      type: "counts";
      /** The share of the rows with each value, from 0 to 1. */
      getShare: (value: string) => number;
      /**
       * The rows that have one of the values, or with `isNegated`, the rows
       * that have none of them.
       */
      getMatchCount: (values: string[], isNegated: boolean) => NumberMatchCount;
      isEstimate: boolean;
    };

const NO_COUNTS: ValueCounts = { type: "none" };

/**
 * Prototype: how many rows of the query have each value of a column with a few
 * values. The other filters of the query apply. Queries on the fast tables
 * count the data. A query on a slow table counts its sample, and the counts
 * are estimates.
 */
export function useValueCounts({
  query,
  stageIndex,
  column,
  filter,
  isEnabled,
}: UseValueCountsProps): ValueCounts {
  const source = useStatsSource(query);
  const isSample = source.type === "sample";
  const countsQuery = useMemo(() => {
    if (!isEnabled || source.type === "none") {
      return null;
    }
    const base = getStatsBase(query, stageIndex, column, filter);
    return base != null ? getValueCountsQuery(base) : null;
  }, [isEnabled, source.type, query, stageIndex, column, filter]);
  const countsJsQuery = useStableJsQuery(countsQuery);
  const { currentData: dataset } = useGetPrototypeStatsQueryQuery(
    countsJsQuery != null ? { query: countsJsQuery, isSample } : skipToken,
  );
  const rows = dataset?.data?.rows;

  return useMemo((): ValueCounts => {
    if (countsQuery == null || rows == null) {
      return NO_COUNTS;
    }
    const counts = parseValueCountRows(rows);
    const total = Array.from(counts.values()).reduce((a, b) => a + b, 0);
    if (isSample && total < MIN_SAMPLE_ROWS) {
      return { type: "unavailable" };
    }
    // Each row of the sample stands for this many rows of the table.
    const scale =
      source.type === "sample" ? source.rowCount / source.sampleCount : 1;
    const countOf = (values: string[]) =>
      Array.from(new Set(values)).reduce(
        (sum, value) => sum + (counts.get(value) ?? 0),
        0,
      );
    return {
      type: "counts",
      getShare: (value) => (total > 0 ? (counts.get(value) ?? 0) / total : 0),
      getMatchCount: (values, isNegated) => {
        const count = isNegated ? total - countOf(values) : countOf(values);
        return {
          count: count * scale,
          isEstimate: isSample,
          isFew: isSample && count < MIN_SAMPLE_MATCHES,
        };
      },
      isEstimate: isSample,
    };
  }, [source, isSample, countsQuery, rows]);
}
