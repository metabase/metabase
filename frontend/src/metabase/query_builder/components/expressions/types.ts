import type * as Lib from "metabase-lib";

type ClauseByStartRule = {
  expression: Lib.ExpressionClause;
  aggregation: Lib.AggregationClause;
  boolean: Lib.FilterClause;
};

export type StartRule = keyof ClauseByStartRule;
export type ClauseType<S extends StartRule> = ClauseByStartRule[S];
