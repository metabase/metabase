import { isTableFieldSchema } from "embedding-sdk-shared/lib/create-metabase-query/input-guards";
import type { ColumnMetadata, Query } from "metabase-lib";
import * as Lib from "metabase-lib";
import { isObject } from "metabase-types/guards";

import { normalizeSort } from "../input-utils";

const STAGE_INDEX = 0;

export function applySorts(
  query: Query,
  sorts: readonly unknown[] | undefined,
): Query | null {
  let nextQuery = query;

  for (const sort of sorts ?? []) {
    const { column, direction } = normalizeSort(sort);

    const libColumn = findOrderableColumn(nextQuery, column);

    if (!libColumn) {
      return null;
    }

    nextQuery = Lib.orderBy(nextQuery, STAGE_INDEX, libColumn, direction);
  }

  return nextQuery;
}

function findOrderableColumn(
  query: Query,
  column: unknown,
): ColumnMetadata | null {
  const name = getSortColumnName(column);

  if (!name) {
    return null;
  }

  const lowerName = name.toLowerCase();

  return (
    Lib.orderableColumns(query, STAGE_INDEX).find(
      (orderableColumn) =>
        Lib.displayInfo(
          query,
          STAGE_INDEX,
          orderableColumn,
        ).name?.toLowerCase() === lowerName,
    ) ?? null
  );
}

function getSortColumnName(column: unknown): string | null {
  if (typeof column === "string") {
    return column;
  }

  if (isTableFieldSchema(column)) {
    return column.name;
  }

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
