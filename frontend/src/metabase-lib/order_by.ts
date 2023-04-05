import * as ML from "cljs/metabase.lib.js";
import type {
  ColumnMetadata,
  OrderByClause,
  OrderByDirection,
  Query,
} from "./types";

const DEFAULT_STAGE_INDEX = -1;

// sorts()
// hasSorts() DONE
// sortOptions()
// canAddSort()
// addSort()
// updateSort()
// removeSort()
// clearSort()
// replaceSort()

export function orderableColumns(
  query: Query,
  stageIndex = DEFAULT_STAGE_INDEX,
): ColumnMetadata[] {
  return ML.orderable_columns(query, stageIndex);
}

export function orderBys(
  query: Query,
  stageIndex = DEFAULT_STAGE_INDEX,
): OrderByClause[] {
  return ML.order_bys(query, stageIndex);
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

declare function OrderByClauseFn(
  query: Query,
  field: ColumnMetadata,
  direction?: OrderByDirection,
): OrderByClause;
declare function OrderByClauseFn(
  query: Query,
  stageIndex: number,
  field: ColumnMetadata,
  direction?: OrderByDirection,
): OrderByClause;

export const orderByClause: typeof OrderByClauseFn = ML.order_by_clause;
