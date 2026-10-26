import { useMemo } from "react";

import * as Lib from "metabase-lib";

/** The stage after a summary, where filters on its aggregations live. */
export type SummaryStage = {
  query: Lib.Query;
  stageIndex: number;
};

/**
 * The summary stage of `stageIndex`, or `undefined` while the stage has no
 * aggregation. Until the query has that stage, the stage is edited on a copy
 * with it appended, so the first filter creates it on apply.
 */
export function useSummaryStage(
  query: Lib.Query,
  stageIndex: number,
): SummaryStage | undefined {
  const summaryStageIndex = stageIndex + 1;
  const hasSummary = Lib.aggregations(query, stageIndex).length > 0;
  return useMemo(
    () =>
      hasSummary
        ? {
            query:
              Lib.stageCount(query) > summaryStageIndex
                ? query
                : Lib.appendStage(query),
            stageIndex: summaryStageIndex,
          }
        : undefined,
    [query, hasSummary, summaryStageIndex],
  );
}

/**
 * The summary's aggregation columns (Count, Sum of Total…) as filterable
 * columns of the summary stage. On that stage every column comes from the
 * previous stage, so the aggregations are told apart by the names the
 * summary gave them.
 */
export function getAggregationColumns(
  query: Lib.Query,
  stageIndex: number,
  summary: SummaryStage,
): Lib.ColumnMetadata[] {
  const aggregationNames = new Set(
    Lib.returnedColumns(query, stageIndex)
      .map((column) => Lib.displayInfo(query, stageIndex, column))
      .filter((info) => info.isAggregation)
      .map((info) => info.name),
  );
  return Lib.filterableColumns(summary.query, summary.stageIndex).filter(
    (column) =>
      aggregationNames.has(
        Lib.displayInfo(summary.query, summary.stageIndex, column).name,
      ),
  );
}
