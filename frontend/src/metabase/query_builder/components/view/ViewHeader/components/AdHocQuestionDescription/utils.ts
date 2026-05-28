import { msgid, ngettext, t } from "ttag";

import * as Lib from "metabase-lib";

type DescribeQueryStageOptions = {
  /**
   * When true, strips temporal bucket suffixes from breakout names
   * (e.g. "Created At" instead of "Created At: Month"). Useful when the
   * granularity is shown separately via a UI control.
   */
  stripTemporalBucket?: boolean;
};

/**
 * Formats a human-readable description of the aggregations and breakouts at a
 * specific query stage. Used by both the query builder title and MCP app titles.
 */
export const describeQueryStage = (
  query: Lib.Query,
  stageIndex: number,
  { stripTemporalBucket = false }: DescribeQueryStageOptions = {},
): string | null => {
  const aggregations = Lib.aggregations(query, stageIndex);
  const breakouts = Lib.breakouts(query, stageIndex);

  let aggregationDescription: string | null = null;

  if (aggregations.length > 2) {
    aggregationDescription = ngettext(
      msgid`${aggregations.length} metric`,
      `${aggregations.length} metrics`,
      aggregations.length,
    );
  } else if (aggregations.length > 0) {
    aggregationDescription = aggregations
      .map(
        (aggregation) =>
          Lib.displayInfo(query, stageIndex, aggregation).longDisplayName,
      )
      .join(t` and `);
  }

  let breakoutDescription: string | null = null;
  if (breakouts.length > 2) {
    breakoutDescription = ngettext(
      msgid`${breakouts.length} breakout`,
      `${breakouts.length} breakouts`,
      breakouts.length,
    );
  } else if (breakouts.length > 0) {
    breakoutDescription = breakouts
      .map((breakout) => {
        if (stripTemporalBucket) {
          const column = Lib.breakoutColumn(query, stageIndex, breakout);

          if (column && Lib.isTemporalBucketable(query, stageIndex, column)) {
            const unbucketed = Lib.withTemporalBucket(column, null);

            return Lib.displayInfo(query, stageIndex, unbucketed).displayName;
          }
        }

        return Lib.displayInfo(query, stageIndex, breakout).longDisplayName;
      })
      .join(t` and `);
  }

  if (!aggregationDescription && !breakoutDescription) {
    return null;
  }

  return [aggregationDescription, breakoutDescription]
    .filter(Boolean)
    .join(t` by `);
};

export const getInfoStageIndex = (query: Lib.Query): number => {
  const hasExtraEmptyFilterStage =
    Lib.stageCount(query) > 1 && !Lib.hasClauses(query, -1);

  if (hasExtraEmptyFilterStage) {
    /**
     * If query is multi-stage and the last stage is empty (which means it's
     * an extra filtering stage - see Lib.ensureFilterStage), the last stage won't
     * provide any useful information to generate question description.
     * We have to use the previous, non-empty stage.
     */
    return -2;
  }

  return -1;
};
