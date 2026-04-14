import * as Lib from "metabase-lib";

/**
 * Matches the notebook editor's logic: a stage is hidden when
 * the previous stage has aggregations but no breakouts.
 * See `getQuestionSteps` in notebook/utils/steps.ts.
 */
export function hasAggregationWithoutBreakoutOnPrevStage(
  query: Lib.Query,
  stageIndex: number,
) {
  if (stageIndex < 1) {
    return false;
  }

  const hasAggregations = Lib.aggregations(query, stageIndex - 1).length > 0;
  const hasBreakouts = Lib.breakouts(query, stageIndex - 1).length > 0;

  return hasAggregations && !hasBreakouts;
}
