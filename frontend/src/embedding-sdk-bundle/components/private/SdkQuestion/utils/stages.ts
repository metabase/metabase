import * as Lib from "metabase-lib";

export const LAST_STAGE_INDEX = -1;

/**
 * Returns the last stage index that has aggregations or breakouts.
 * Walks backwards from the last stage — if a stage has nothing to show,
 * falls back to the previous one.
 */
export function getLastVisibleStageIndex(query: Lib.Query | undefined): number {
  if (!query) {
    return LAST_STAGE_INDEX;
  }

  const indexes = Lib.stageIndexes(query);

  for (let i = indexes.length - 1; i >= 0; i--) {
    const stageIndex = indexes[i];
    const hasAggregations = Lib.aggregations(query, stageIndex).length > 0;
    const hasBreakouts = Lib.breakouts(query, stageIndex).length > 0;

    if (hasAggregations || hasBreakouts) {
      return stageIndex;
    }
  }

  return 0;
}
