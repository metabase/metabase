import * as ML from "cljs/metabase.lib.js";

import type {
  CardMetadata,
  ColumnMetadata,
  ExternalOp,
  FilterOperator,
  Join,
  JoinStrategy,
  Query,
  TableMetadata,
} from "./types";

export function joinStrategy(join: Join): JoinStrategy {
  return ML.join_strategy(join);
}

export function withJoinStrategy(join: Join, strategy: JoinStrategy): Join {
  return ML.with_join_strategy(join, strategy);
}

export function availableJoinStrategies(
  query: Query,
  stageIndex: number,
): JoinStrategy[] {
  return ML.available_join_strategies(query, stageIndex);
}

export function joinConditionLHSColumns(
  query: Query,
  stageIndex: number,
  rhsColumn?: ColumnMetadata,
): ColumnMetadata[] {
  return ML.join_condition_lhs_columns(query, stageIndex, rhsColumn);
}

export function joinConditionRHSColumns(
  query: Query,
  stageIndex: number,
  joinedThing: TableMetadata | CardMetadata,
  lhsColumn?: ColumnMetadata,
): ColumnMetadata[] {
  return ML.join_condition_rhs_columns(
    query,
    stageIndex,
    joinedThing,
    lhsColumn,
  );
}

export function joinConditionOperators(
  query: Query,
  stageIndex: number,
  lhsColumn?: ColumnMetadata,
  rhsColumn?: ColumnMetadata,
): FilterOperator[] {
  return ML.join_condition_operators(query, stageIndex, lhsColumn, rhsColumn);
}

export function suggestedJoinCondition(
  query: Query,
  stageIndex: number,
  joinedThing: TableMetadata | CardMetadata,
): ExternalOp | null {
  return ML.suggested_join_condition(query, stageIndex, joinedThing);
}
