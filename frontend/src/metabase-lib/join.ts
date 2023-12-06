import * as ML from "cljs/metabase.lib.js";

import type {
  Bucket,
  CardMetadata,
  Clause,
  ColumnMetadata,
  Join,
  JoinCondition,
  JoinConditionOperator,
  JoinConditionParts,
  JoinStrategy,
  Query,
  TableMetadata,
} from "./types";
import { expressionParts } from "./expression";
import { isColumnMetadata } from "./internal";
import { displayInfo } from "./metadata";

/**
 * Something you can join against -- either a raw Table, or a Card, which can be either a plain Saved Question or a
 * Model
 */
export type Joinable = TableMetadata | CardMetadata;

type JoinOrJoinable = Join | Joinable;

type ColumnMetadataOrFieldRef = ColumnMetadata | Clause;

export function joins(query: Query, stageIndex: number): Join[] {
  return ML.joins(query, stageIndex);
}

export function joinClause(
  joinable: Joinable,
  conditions: JoinCondition[],
): Join {
  return ML.join_clause(joinable, conditions);
}

export function joinConditionClause(
  query: Query,
  stageIndex: number,
  operator: JoinConditionOperator,
  lhsColumn: ColumnMetadata,
  rhsColumn: ColumnMetadata,
): JoinCondition {
  const operatorInfo = displayInfo(query, stageIndex, operator);
  return ML.expression_clause(operatorInfo.shortName, [lhsColumn, rhsColumn]);
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

export function joinConditions(join: Join): JoinCondition[] {
  return ML.join_conditions(join);
}

export function joinConditionParts(
  query: Query,
  stageIndex: number,
  condition: JoinCondition,
): JoinConditionParts {
  const {
    operator: operatorName,
    args: [lhsColumn, rhsColumn],
  } = expressionParts(query, stageIndex, condition);

  if (!isColumnMetadata(lhsColumn) || !isColumnMetadata(rhsColumn)) {
    throw new TypeError("Unexpected join condition");
  }

  const operator = joinConditionOperators(
    query,
    stageIndex,
    lhsColumn,
    rhsColumn,
  ).find(op => displayInfo(query, stageIndex, op).shortName === operatorName);

  if (!operator) {
    throw new TypeError("Unexpected join condition");
  }

  return { operator, lhsColumn, rhsColumn };
}

export function withJoinConditions(
  join: Join,
  newConditions: JoinCondition[],
): Join {
  return ML.with_join_conditions(join, newConditions);
}

export function joinConditionUpdateTemporalBucketing(
  query: Query,
  stageIndex: number,
  condition: JoinCondition,
  bucket: Bucket,
): JoinCondition {
  return ML.join_condition_update_temporal_bucketing(
    query,
    stageIndex,
    condition,
    bucket,
  );
}

/**
 * Get a sequence of columns that can be used as the left-hand-side (source column) in a join condition. This column
 * is the one that comes from the source Table/Card/previous stage of the query or a previous join.
 *
 * If you are changing the LHS of a condition for an existing join, pass in that existing join as `joinOrJoinable` so
 * we can filter out the columns added by it (it doesn't make sense to present the columns added by a join as options
 * for its own LHS) or added by later joins (joins can only depend on things from previous joins). Otherwise you can
 * either pass in `nil` or the `Joinable` (Table or Card metadata) we're joining against when building a new
 * join. (Things other than joins are ignored, but this argument is flexible for consistency with the signature
 * of `joinConditionRHSColumns`.) See #32005 for more info.
 *
 * If the left-hand-side column has already been chosen and we're UPDATING it, pass in `lhs-column-or-nil` so we can
 * mark the current column as `:selected` in the metadata/display info.
 *
 * If the right-hand-side column has already been chosen (they can be chosen in any order in the Query Builder UI),
 * pass in the chosen RHS column. In the future, this may be used to restrict results to compatible columns. (See #31174)
 *
 * Results will be returned in a 'somewhat smart' order with PKs and FKs returned before other columns.
 *
 * Unlike most other things that return columns, implicitly-joinable columns ARE NOT returned here.
 */
export function joinConditionLHSColumns(
  query: Query,
  stageIndex: number,
  joinOrJoinable?: JoinOrJoinable,
  lhsColumn?: ColumnMetadataOrFieldRef,
  rhsColumn?: ColumnMetadataOrFieldRef,
): ColumnMetadata[] {
  return ML.join_condition_lhs_columns(
    query,
    stageIndex,
    joinOrJoinable,
    lhsColumn,
    rhsColumn,
  );
}

/**
 * Get a sequence of columns that can be used as the right-hand-side (target column) in a join condition. This column
 * is the one that belongs to the thing being joined, `joinOrJoinable`, which can be something like a
 * TableMetadata, Saved Question/Model (CardMetadata), another query, etc. -- anything you can pass to `join-clause`.
 * You can also pass in an existing join.
 *
 * If the left-hand-side column has already been chosen (they can be chosen in any order in the Query Builder UI),
 * pass in the chosen LHS column. In the future, this may be used to restrict results to compatible columns. (See #31174)
 *
 * If the right-hand-side column has already been chosen and we're UPDATING it, pass in `rhs-column-or-nil` so we can
 * mark the current column as `:selected` in the metadata/display info.
 *
 * Results will be returned in a 'somewhat smart' order with PKs and FKs returned before other columns.
 */
export function joinConditionRHSColumns(
  query: Query,
  stageIndex: number,
  joinOrJoinable?: JoinOrJoinable,
  lhsColumn?: ColumnMetadataOrFieldRef,
  rhsColumn?: ColumnMetadataOrFieldRef,
): ColumnMetadata[] {
  return ML.join_condition_rhs_columns(
    query,
    stageIndex,
    joinOrJoinable,
    lhsColumn,
    rhsColumn,
  );
}

export function joinConditionOperators(
  query: Query,
  stageIndex: number,
  lhsColumn?: ColumnMetadata,
  rhsColumn?: ColumnMetadata,
): JoinConditionOperator[] {
  return ML.join_condition_operators(query, stageIndex, lhsColumn, rhsColumn);
}

export function suggestedJoinConditions(
  query: Query,
  stageIndex: number,
  joinable: Joinable,
): JoinCondition[] {
  return ML.suggested_join_conditions(query, stageIndex, joinable);
}

export type JoinFields = ColumnMetadata[] | "all" | "none";

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
  joinOrJoinable: JoinOrJoinable,
): ColumnMetadata[] {
  return ML.joinable_columns(query, stageIndex, joinOrJoinable);
}

/**
 * Get the display name for whatever we are joining. See #32015 and #32764 for screenshot examples.
 *
 * The rules, copied from MLv1, are as follows:
 *
 * 1. If we have the LHS column for the first join condition, we should use display name for wherever it comes from.
 *    E.g. if the join is
 *
 *    ```
 *    JOIN whatever ON orders.whatever_id = whatever.id
 *    ```
 *
 *    then we should display the join like this:
 *
 *   ```
 *   +--------+   +----------+    +-------------+    +----------+
 *   | Orders | + | Whatever | on | Orders      | =  | Whatever |
 *   |        |   |          |    | Whatever ID |    | ID       |
 *   +--------+   +----------+    +-------------+    +----------+
 *   ```
 *
 *   1a. If `joinOrJoinable` is a join, we can take the condition LHS column from the join itself, since a join will
 *       always have a condition.
 *
 *   1b. When building a join, you can optionally pass in `conditionLHSColumn` yourself.
 *
 * 2. If the condition LHS column is unknown, and this is the first join in the first stage of a query, and the query
 *    uses a source Table, then use the display name for the source Table.
 *
 * 3. Otherwise use `Previous results`.
 *
 * This function needs to be usable while we are in the process of constructing a join in the context of a given stage,
 * but also needs to work for rendering existing joins. Pass a join in for existing joins, or something [[Joinable]]
 * for ones we are currently building.
 */
export function joinLHSDisplayName(
  query: Query,
  stageIndex: number,
  joinOrJoinable?: JoinOrJoinable,
  conditionLHSColumn?: ColumnMetadata,
): string {
  return ML.join_lhs_display_name(
    query,
    stageIndex,
    joinOrJoinable,
    conditionLHSColumn,
  );
}
