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
  joinable: Joinable,
  conditions: FilterClause[] | ExternalOp[],
): Join {
  return ML.join_clause(joinable, conditions);
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

export function joinConditions(join: Join): FilterClause[] {
  return ML.join_conditions(join);
}

export function withJoinConditions(
  join: Join,
  newConditions: FilterClause[] | ExternalOp[],
): Join {
  return ML.with_join_conditions(join, newConditions);
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

type JoinFields = ColumnMetadata[] | "all" | "none";

export function joinFields(join: Join): JoinFields {
  return ML.join_fields(join);
}

export function withJoinFields(join: Join, newFields: JoinFields): Join {
  return ML.with_join_fields(join, newFields);
}

export function renameJoin(
  query: Query,
  stageIndex: number,
  joinSpec: Join | string | number,
  newName: string,
): Query {
  return ML.rename_join(query, stageIndex, joinSpec, newName);
}

export function removeJoin(
  query: Query,
  stageIndex: number,
  joinSpec: Join | string | number,
): Query {
  return ML.remove_join(query, stageIndex, joinSpec);
}

export function joinedThing(query: Query, join: Join): Joinable {
  return ML.joined_thing(query, join);
}

export type PickerInfo = {
  databaseId: number;
  tableId: number;
  cardId?: number;
  isModel?: boolean;
};

export function pickerInfo(query: Query, metadata: Joinable): PickerInfo {
  return ML.picker_info(query, metadata);
}

export function joinableColumns(
  query: Query,
  stageIndex: number,
  joinOrJoinable: Join | Joinable,
): ColumnMetadata[] {
  return ML.joinable_columns(query, stageIndex, joinOrJoinable);
}
