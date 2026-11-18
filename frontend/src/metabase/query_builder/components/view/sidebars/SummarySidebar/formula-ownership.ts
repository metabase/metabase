import * as Lib from "metabase-lib";

import { areQueriesEqual } from "./utils";

export function removeUnusedFormula(
  query: Lib.Query,
  stageIndex: number,
  expression: Lib.ExpressionClause,
): Lib.Query {
  const nextQuery = Lib.removeClause(query, stageIndex, expression);
  if (Lib.stageCount(nextQuery) !== Lib.stageCount(query)) {
    return query;
  }
  const { displayName } = Lib.displayInfo(query, stageIndex, expression);
  // Re-adding the formula cannot restore any dependents removed with it.
  const restoredQuery = Lib.expression(
    nextQuery,
    stageIndex,
    displayName,
    expression,
  );
  return areQueriesEqual(query, restoredQuery) ? nextQuery : query;
}
