import {
  change_direction,
  order_by,
  order_by_clause,
  order_bys,
  orderable_columns,
} from "cljs/metabase.lib.js";

import { removeClause } from "./query";
import type {
  ColumnMetadata,
  OrderByClause,
  OrderByDirection,
  Query,
} from "./types";

export function orderableColumns(
  query: Query,
  stageIndex: number,
): ColumnMetadata[] {
  return orderable_columns(query, stageIndex);
}

export function orderBys(query: Query, stageIndex: number): OrderByClause[] {
  return order_bys(query, stageIndex);
}

export function orderBy(
  query: Query,
  stageIndex: number,
  column: ColumnMetadata | OrderByClause,
  direction?: OrderByDirection,
): Query {
  return order_by(query, stageIndex, column, direction);
}

export function orderByClause(
  column: ColumnMetadata,
  direction?: OrderByDirection,
): OrderByClause {
  return order_by_clause(column, direction);
}

export function changeDirection(query: Query, clause: OrderByClause): Query {
  return change_direction(query, clause);
}

export function removeOrderBys(query: Query, stageIndex: number): Query {
  return orderBys(query, stageIndex).reduce(
    (newQuery, orderBy) => removeClause(newQuery, stageIndex, orderBy),
    query,
  );
}
