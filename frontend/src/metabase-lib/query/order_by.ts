import * as ML from "cljs/metabase.lib.js";

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
  return ML.orderable_columns(query, stageIndex) || [];
}

export function orderBys(query: Query, stageIndex: number): OrderByClause[] {
  return ML.order_bys(query, stageIndex) || [];
}

export function orderBy(
  query: Query,
  stageIndex: number,
  column: ColumnMetadata | OrderByClause,
  direction?: OrderByDirection,
): Query {
  return ML.order_by(query, stageIndex, column, direction);
}

export function orderByClause(
  column: ColumnMetadata,
  direction?: OrderByDirection,
): OrderByClause {
  const clause = ML.order_by_clause(column, direction);
  if (!isOrderByClause(clause)) {
    throw new TypeError(
      "Expected order_by_clause to return an order-by clause",
    );
  }
  return clause;
}

function isOrderByClause(clause: unknown): clause is OrderByClause {
  return (
    Array.isArray(clause) &&
    clause.length >= 2 &&
    (clause[0] === "asc" || clause[0] === "desc")
  );
}

export function changeDirection(query: Query, clause: OrderByClause): Query {
  return ML.change_direction(query, clause);
}

export function removeOrderBys(query: Query, stageIndex: number): Query {
  return orderBys(query, stageIndex).reduce(
    (newQuery, orderBy) => removeClause(newQuery, stageIndex, orderBy),
    query,
  );
}
