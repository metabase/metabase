import { isTableFieldSchema } from "embedding-sdk-shared/lib/create-metabase-query/input-guards";
import type { BreakoutClause, ColumnMetadata, Query } from "metabase-lib";
import * as Lib from "metabase-lib";
import { isObject } from "metabase-types/guards";

import type { ColumnReferenceInput } from "../input-types";
import { normalizeSort } from "../input-utils";

import { findLibColumn } from "./column";

const STAGE_INDEX = 0;

type Orderable = ColumnMetadata | BreakoutClause;

export function applySorts(
  query: Query,
  sorts: readonly unknown[] | undefined,
): Query | null {
  let nextQuery = query;

  for (const sort of sorts ?? []) {
    const { column, direction } = normalizeSort(sort);

    if (direction == null) {
      return null;
    }

    const orderable = findOrderable(nextQuery, column);

    if (!orderable) {
      return null;
    }

    nextQuery = Lib.orderBy(nextQuery, STAGE_INDEX, orderable, direction);
  }

  return nextQuery;
}

// Resolves the sort target from clauses already present in the query rather than
// from `Lib.orderableColumns`. `orderableColumns` eagerly computes metadata for
// every column, including metric/measure aggregations — but the data-app's
// synthetic metadata provider does not carry their inner definitions, so it
// throws. Ordering by an existing breakout/aggregation clause avoids that and
// keeps the order-by ref aligned with the breakout (temporal bucket, binning).
function findOrderable(query: Query, column: unknown): Orderable | null {
  if (typeof column === "string" || isTableFieldSchema(column)) {
    return findDimensionOrderable(query, column);
  }

  return findAggregationOrderable(query, column);
}

function findDimensionOrderable(
  query: Query,
  column: ColumnReferenceInput,
): Orderable | null {
  const name = typeof column === "string" ? column : column.name;

  const breakoutClause = findClauseByName(
    query,
    Lib.breakouts(query, STAGE_INDEX),
    name,
  );

  if (breakoutClause) {
    return breakoutClause;
  }

  // Non-aggregated query: order by the raw field, resolved by field id.
  return findLibColumn(query, column);
}

function findAggregationOrderable(
  query: Query,
  column: unknown,
): Orderable | null {
  const name = getAggregationColumnName(column);

  if (!name) {
    return null;
  }

  // Ordering by an aggregation needs its column metadata. Computing it fails
  // when the query contains a metric/measure whose definition the data-app
  // metadata provider lacks, so guard it and fail the build (clear error)
  // rather than crash.
  const orderableColumns = getOrderableColumns(query);
  const lowerName = name.toLowerCase();

  return (
    orderableColumns.find(
      (orderableColumn) =>
        Lib.displayInfo(
          query,
          STAGE_INDEX,
          orderableColumn,
        ).name?.toLowerCase() === lowerName,
    ) ?? null
  );
}

function getOrderableColumns(query: Query): ColumnMetadata[] {
  try {
    return Lib.orderableColumns(query, STAGE_INDEX);
  } catch {
    return [];
  }
}

function findClauseByName<TClause extends BreakoutClause>(
  query: Query,
  clauses: TClause[],
  name: string,
): TClause | null {
  const lowerName = name.toLowerCase();

  return (
    clauses.find(
      (clause) =>
        Lib.displayInfo(query, STAGE_INDEX, clause).name?.toLowerCase() ===
        lowerName,
    ) ?? null
  );
}

function getAggregationColumnName(column: unknown): string | null {
  if (isObject(column) && column.type === "count") {
    return "count";
  }

  if (
    isObject(column) &&
    Array.isArray(column.columns) &&
    isObject(column.columns[0]) &&
    typeof column.columns[0].name === "string"
  ) {
    return column.columns[0].name;
  }

  return null;
}

export function applyLimit(query: Query, limit: unknown): Query | null {
  if (limit == null) {
    return query;
  }

  if (typeof limit !== "number" || !Number.isInteger(limit) || limit < 0) {
    return null;
  }

  return Lib.limit(query, STAGE_INDEX, limit);
}
