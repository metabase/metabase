import {
  isMetricReference,
  isTableFieldSchema,
} from "embedding-sdk-shared/lib/create-metabase-query/input-guards";
import type { ColumnMetadata, Query } from "metabase-lib";
import * as Lib from "metabase-lib";

import {
  isCountAggregation,
  isFieldAggregation,
  isMeasureSchema,
} from "../guards";
import type { ColumnReferenceInput } from "../input-types";
import { getFieldId, normalizeSort } from "../input-utils";

const STAGE_INDEX = 0;

export function applySorts(
  query: Query,
  sorts: readonly unknown[] | undefined,
  aggregationOrder: readonly unknown[],
): Query | null {
  let nextQuery = query;

  for (const sort of sorts ?? []) {
    const { column, direction } = normalizeSort(sort);

    if (direction == null) {
      return null;
    }

    const orderableColumn = findOrderableColumn(
      nextQuery,
      column,
      aggregationOrder,
    );

    if (!orderableColumn) {
      return null;
    }

    nextQuery = Lib.orderBy(nextQuery, STAGE_INDEX, orderableColumn, direction);
  }

  return nextQuery;
}

// Resolves the sort target to one of the query's orderable columns — the same
// path the notebook uses. `orderableColumns` returns the query's breakout and
// aggregation columns (bucketed breakouts keep their temporal unit / binning).
function findOrderableColumn(
  query: Query,
  column: unknown,
  aggregationOrder: readonly unknown[],
): ColumnMetadata | null {
  const orderableColumns = Lib.orderableColumns(query, STAGE_INDEX);

  if (typeof column === "string" || isTableFieldSchema(column)) {
    return findDimensionColumn(query, orderableColumns, column);
  }

  return findAggregationColumn(
    query,
    orderableColumns,
    column,
    aggregationOrder,
  );
}

function findDimensionColumn(
  query: Query,
  orderableColumns: ColumnMetadata[],
  column: ColumnReferenceInput,
): ColumnMetadata | null {
  // Field references match by field id first: `orderableColumns` can include
  // implicitly-joinable columns from other tables that share a name (`id`,
  // `name`, ...), so a name-only match could pick the wrong column.
  if (isTableFieldSchema(column)) {
    const fieldId = getFieldId(column);

    if (fieldId != null) {
      const columnByFieldId = orderableColumns.find(
        (orderableColumn) =>
          Lib.fieldValuesSearchInfo(query, orderableColumn).fieldId === fieldId,
      );

      if (columnByFieldId) {
        return columnByFieldId;
      }
    }
  }

  const name = (
    typeof column === "string" ? column : column.name
  ).toLowerCase();

  return (
    orderableColumns.find(
      (orderableColumn) =>
        Lib.displayInfo(
          query,
          STAGE_INDEX,
          orderableColumn,
        ).name?.toLowerCase() === name,
    ) ?? null
  );
}

// Aggregation columns appear in `orderableColumns` in aggregation order, so the
// sort target's position among the query's aggregations selects its column.
function findAggregationColumn(
  query: Query,
  orderableColumns: ColumnMetadata[],
  target: unknown,
  aggregationOrder: readonly unknown[],
): ColumnMetadata | null {
  const aggregationIndex = aggregationOrder.findIndex((aggregation) =>
    aggregationsMatch(target, aggregation),
  );

  if (aggregationIndex < 0) {
    return null;
  }

  const aggregationColumns = orderableColumns.filter(
    (orderableColumn) =>
      Lib.displayInfo(query, STAGE_INDEX, orderableColumn).isAggregation,
  );

  return aggregationColumns[aggregationIndex] ?? null;
}

function aggregationsMatch(target: unknown, aggregation: unknown): boolean {
  if (target === aggregation) {
    return true;
  }

  if (isMeasureSchema(target) && isMeasureSchema(aggregation)) {
    return target.id === aggregation.id;
  }

  if (isMetricReference(target) && isMetricReference(aggregation)) {
    return target.id === aggregation.id;
  }

  if (isCountAggregation(target) && isCountAggregation(aggregation)) {
    return true;
  }

  if (isFieldAggregation(target) && isFieldAggregation(aggregation)) {
    return (
      target.type === aggregation.type &&
      sameDimension(target.dimension, aggregation.dimension)
    );
  }

  return false;
}

function sameDimension(left: unknown, right: unknown): boolean {
  const leftId = getFieldId(left);

  return leftId != null && leftId === getFieldId(right);
}
