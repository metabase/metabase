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

// Get a sequence of columns that can be used as the left-hand-side (source column) in a join condition. This column
// is the one that comes from the source Table/Card/previous stage of the query or a previous join.
//
// If you are changing the LHS of a condition for an existing join, pass in that existing join as
// so we can filter out the columns added by it (it doesn't make sense to present the columns
// added by a join as options for its own LHS) or added by later joins (joins can only depend on things from previous
// joins). Otherwise pass `null` when building a new join. See #32005 for more info.
//
// If the right-hand-side column has already been chosen (they can be chosen in any order in the Query Builder UI),
// pass in the chosen RHS column. In the future, this may be used to restrict results to compatible columns. (See #31174)
//
// Results will be returned in a 'somewhat smart' order with PKs and FKs returned before other columns.
//
// Unlike most other things that return columns, implicitly-joinable columns ARE NOT returned here.
export function joinConditionLHSColumns(
  query: Query,
  stageIndex: number,
  existingJoin?: Join,
  rhsColumn?: ColumnMetadata,
): ColumnMetadata[] {
  return ML.join_condition_lhs_columns(
    query,
    stageIndex,
    existingJoin,
    rhsColumn,
  );
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

type JoinOrJoinable = Join | Joinable;

export function joinableColumns(
  query: Query,
  stageIndex: number,
  joinOrJoinable: JoinOrJoinable,
): ColumnMetadata[] {
  return ML.joinable_columns(query, stageIndex, joinOrJoinable);
}

// Get the display name to use when rendering a join for whatever we are joining against (e.g. a Table or Card of some
// sort). See #32015 for screenshot examples. For an existing join, pass in the join clause. When constructing a join,
// pass in the thing we are joining against, e.g. a TableMetadata or CardMetadata.
export function joinLHSDisplayName(
  query: Query,
  stageIndex: number,
  joinOrJoinable?: JoinOrJoinable,
): string {
  return ML.join_lhs_display_name(query, stageIndex, joinOrJoinable);
}
