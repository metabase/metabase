import * as ML from "cljs/metabase.lib.js";
import type { Field } from "metabase-types/api";
import type { OrderByClause, Query } from "./types";

/// returns array of opaque objects
export function orderableColumns(query: Query): [] {
  return ML.orderable_columns(query);
}

export function orderBys(query: Query): OrderByClause[] {
  const result = ML.order_bys(query);
  return result === null ? [] : result;
}

declare function OrderByFn(query: Query, field: Field): Query;
declare function OrderByFn(
  query: Query,
  stageIndex: number,
  field: Field,
): Query;

export const orderBy: typeof OrderByFn = ML.order_by;

export function orderByClause(
  query: Query,
  stageNumber: number,
  field: Field,
): Field {
  return ML.order_by_clause(query, stageNumber, field);
}
