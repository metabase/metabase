import type { DateFilterValue } from "metabase/querying/common/types";
import { getDateFilterClause } from "metabase/querying/filters/utils/dates";
import type { ColumnMetadata, Query } from "metabase-lib";
import * as Lib from "metabase-lib";

/**
 * Case-insensitive column lookup — handles H2 uppercasing vs Postgres lowercase.
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
 * Apply a DatePickerValue filter to a date column on the query.
 * Uses the same filter clause generation as Metabase's standard date picker.
 */
export function applyDateFilter(
  query: Query,
  dateFilter: DateFilterValue,
  columnName = "created_at",
): Query {
  const dateCol = findColumn(query, columnName, Lib.filterableColumns);
  if (!dateCol) {
    return query;
  }

  const clause = getDateFilterClause(dateCol, dateFilter);
  return Lib.filter(query, 0, clause);
}

/**
 * Add a sum aggregation for the given column name.
 */
export function addSumAggregation(query: Query, columnName: string): Query {
  const operators = Lib.availableAggregationOperators(query, 0);
  const sumOp = operators.find((op) => {
    const info = Lib.displayInfo(query, 0, op);
    return info.shortName === "sum";
  });
  if (!sumOp) {
    return query;
  }

  const columns = Lib.aggregationOperatorColumns(sumOp);
  const lowerName = columnName.toLowerCase();
  const col = columns.find((c) => {
    const info = Lib.displayInfo(query, 0, c);
    return info.name?.toLowerCase() === lowerName;
  });
  if (!col) {
    return query;
  }

  const clause = Lib.aggregationClause(sumOp, col);
  return Lib.aggregate(query, 0, clause);
}
