import * as ML from "cljs/metabase.lib.js";

import type {
  CardMetadata,
  ColumnMetadata,
  ExternalOp,
  FilterClause,
  FilterOperator,
  Join,
  JoinStrategy,
  Query,
  TableMetadata,
} from "./types";

// Something you can join against -- either a raw Table, or a Card, which can be either a plain Saved Question or a
// Model
type Joinable = TableMetadata | CardMetadata;

export function joins(query: Query, stageIndex: number): Join[] {
  return ML.joins(query, stageIndex);
}

export function joinClause(
  query: Query,
  stageIndex: number,
  joinable: Joinable,
  conditions: FilterClause[] | ExternalOp[],
): Join {
  return ML.join_clause(query, stageIndex, joinable, conditions);
}

export function join(query: Query, stageIndex: number, join: Join): Query {
  return ML.join(query, stageIndex, join);
}

export function availableJoinStrategies(
  query: Query,
  stageIndex: number,
): JoinStrategy[] {
  return ML.available_join_strategies(query, stageIndex);
}

export function joinStrategy(join: Join): JoinStrategy {
  return ML.join_strategy(join);
}

export function withJoinStrategy(join: Join, strategy: JoinStrategy): Join {
  return ML.with_join_strategy(join, strategy);
}

export function joinConditions(join: Join): ExternalOp[] {
  return ML.join_conditions(join);
}

/// TODO: withJoinConditions

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
  joinable: Joinable,
  lhsColumn?: ColumnMetadata,
): ColumnMetadata[] {
  return ML.join_condition_rhs_columns(query, stageIndex, joinable, lhsColumn);
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
  joinable: Joinable,
): FilterClause | null {
  return ML.suggested_join_condition(query, stageIndex, joinable);
}

export function joinFields(join: Join): ColumnMetadata[] {
  return ML.join_fields(join);
}

export function withJoinFields(join: Join, newFields: ColumnMetadata[]): Join {
  return ML.with_join_fields(join, newFields);
}
