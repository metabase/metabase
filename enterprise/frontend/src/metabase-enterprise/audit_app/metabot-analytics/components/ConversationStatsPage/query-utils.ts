import type { ColumnMetadata, Query } from "metabase-lib";
import * as Lib from "metabase-lib";

/**
 * Find a column by name from a column-fetching function.
 * Handles case-insensitive matching for H2 vs Postgres column naming.
 */
export function findColumn(
  query: Query,
  name: string,
  columnsFn: (q: Query, stageIndex: number) => ColumnMetadata[],
): ColumnMetadata | undefined {
  const columns = columnsFn(query, 0);
  const lowerName = name.toLowerCase();
  return columns.find((col) => {
    const info = Lib.displayInfo(query, 0, col);
    return info.name?.toLowerCase() === lowerName;
  });
}

/**
 * Add a "last N days" relative date filter on created_at to a query.
 */
export function addDateFilter(query: Query, days: number): Query {
  const createdAtCol = findColumn(query, "created_at", Lib.filterableColumns);
  if (!createdAtCol) {
    return query;
  }

  const dateFilter = Lib.relativeDateFilterClause({
    column: createdAtCol,
    value: -days,
    unit: "day",
    offsetValue: null,
    offsetUnit: null,
    options: { includeCurrent: true },
  });

  return Lib.filter(query, 0, dateFilter);
}
