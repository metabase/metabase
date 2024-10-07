import * as Lib from "metabase-lib";

export function getDefaultJoinConditionOperator(
  query: Lib.Query,
  stageIndex: number,
): Lib.JoinConditionOperator {
  const operators = Lib.joinConditionOperators(query, stageIndex);
  return operators[0];
}
