import * as ML from "cljs/metabase.lib.js";
import type { OrderByClause, Query, ColumnMetadata } from "./types";

export function orderableColumns(query: Query): ColumnMetadata[] {
  return ML.orderable_columns(query);
}

export function orderBys(query: Query): OrderByClause[] {
  return ML.order_bys(query);
}

declare function OrderByFn(
  query: Query,
  column: ColumnMetadata | OrderByClause,
): Query;
declare function OrderByFn(
  query: Query,
  stageIndex: number,
  column: ColumnMetadata | OrderByClause,
): Query;

export const orderBy: typeof OrderByFn = ML.order_by;

export function orderByClause(
  query: Query,
  stageNumber: number,
  column: ColumnMetadata,
): OrderByClause {
  return ML.order_by_clause(query, stageNumber, column);
}
