import { useMemo } from "react";

import { skipToken } from "metabase/api";
import type * as Lib from "metabase-lib";

import { useGetPrototypeStatsQueryQuery } from "./api";
import { useStableJsQuery, useStatsSource } from "./use-number-column-stats";
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
  | {
      type: "counts";
      /** The share of the rows with each value, from 0 to 1. */
      getShare: (value: string) => number;
    };

const NO_COUNTS: ValueCounts = { type: "none" };

/**
 * Prototype: the share of the rows of the query with each value of a column
 * with a few values. The other filters of the query apply. Only on fast
 * data, because on slow data each query waits for seconds.
 */
export function useValueCounts({
  query,
  stageIndex,
  column,
  filter,
  isEnabled,
}: UseValueCountsProps): ValueCounts {
  const source = useStatsSource(query);
  const countsQuery = useMemo(() => {
    if (!isEnabled || source.type === "none") {
      return null;
    }
    const base = getStatsBase(query, stageIndex, column, filter);
    return base != null ? getValueCountsQuery(base) : null;
  }, [isEnabled, source.type, query, stageIndex, column, filter]);
  const countsJsQuery = useStableJsQuery(countsQuery);
  const { currentData: dataset } = useGetPrototypeStatsQueryQuery(
    countsJsQuery ?? skipToken,
  );
  const rows = dataset?.data?.rows;

  return useMemo((): ValueCounts => {
    if (countsQuery == null || rows == null) {
      return NO_COUNTS;
    }
    const counts = parseValueCountRows(rows);
    const total = Array.from(counts.values()).reduce((a, b) => a + b, 0);
    return {
      type: "counts",
      getShare: (value) => (total > 0 ? (counts.get(value) ?? 0) / total : 0),
    };
  }, [countsQuery, rows]);
}
