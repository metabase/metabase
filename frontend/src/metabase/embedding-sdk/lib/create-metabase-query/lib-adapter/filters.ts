import { match } from "ts-pattern";

import { isTableFieldSchema } from "embedding-sdk-shared/lib/create-metabase-query/input-guards";
import type {
  ExpressionClause,
  NumberFilterValue,
  Query,
  SegmentMetadata,
} from "metabase-lib";
import * as Lib from "metabase-lib";

import {
  isDimensionFilter,
  isSegmentSchema,
  isTableDimensionFilter,
} from "../guards";
import type { DimensionFilterInput } from "../input-types";
import { isColumnReference } from "../input-utils";

import { findLibColumn } from "./column";
import { buildLibDateFilter } from "./date-filters";
import {
  isBooleanFilterOperator,
  isDefaultFilterOperator,
  isNumberFilterOperator,
  isStringFilterOperator,
} from "./operators";
import { fieldHasTime } from "./query-utils";
import { buildLibRelativeDateFilter } from "./relative-date-filters";

const STAGE_INDEX = 0;

type FilterBuilder = (
  query: Query,
  filter: unknown,
) => ExpressionClause | SegmentMetadata | null;

export function applyFilters(
  query: Query,
  filters: readonly unknown[] | undefined,
  buildFilter: FilterBuilder,
): Query | null {
  let nextQuery = query;

  for (const filter of filters ?? []) {
    const filterClause = buildFilter(nextQuery, filter);

    if (!filterClause) {
      return null;
    }

    nextQuery = Lib.filter(nextQuery, STAGE_INDEX, filterClause);
  }

  return nextQuery;
}

export function buildLibTableFilter(
  query: Query,
  filter: unknown,
): ExpressionClause | SegmentMetadata | null {
  if (isSegmentSchema(filter)) {
    return Lib.segmentMetadata(query, filter.id);
  }

  if (!isDimensionFilter(filter)) {
    return null;
  }

  return buildLibFieldFilter(query, filter);
}

export function buildLibMetricFilter(
  query: Query,
  filter: unknown,
): ExpressionClause | SegmentMetadata | null {
  if (isSegmentSchema(filter)) {
    return Lib.segmentMetadata(query, filter.id);
  }

  if (isTableDimensionFilter(filter)) {
    return buildLibFieldFilter(query, filter);
  }

  return null;
}

function buildLibFieldFilter(
  query: Query,
  filter: DimensionFilterInput,
): ExpressionClause | null {
  const dimension = filter.dimension;

  if (!isColumnReference(dimension)) {
    return null;
  }

  const column = findLibColumn(query, dimension);

  if (!column) {
    return null;
  }

  const values = filter.values ?? [filter.value];

  if (isDefaultFilterOperator(filter.operator)) {
    return Lib.defaultFilterClause({
      operator: filter.operator,
      column,
    });
  }

  if (filter.operator === "time-interval") {
    return buildLibRelativeDateFilter(filter, column);
  }

  const jsType = isTableFieldSchema(dimension) ? dimension.jsType : undefined;

  return match(jsType)
    .with("number", () => {
      if (!isNumberFilterOperator(filter.operator)) {
        return null;
      }

      if (!values.every(isNumberFilterValue)) {
        return null;
      }

      return Lib.numberFilterClause({
        operator: filter.operator,
        column,
        values: [...values],
      });
    })
    .with("boolean", () => {
      if (!isBooleanFilterOperator(filter.operator)) {
        return null;
      }

      if (!values.every(isBooleanFilterValue)) {
        return null;
      }

      return Lib.booleanFilterClause({
        operator: filter.operator,
        column,
        values: [...values],
      });
    })
    .with("Date", () => {
      return buildLibDateFilter({
        operator: filter.operator,
        column,
        values,
        hasTime: isTableFieldSchema(dimension)
          ? fieldHasTime(dimension)
          : false,
      });
    })
    .otherwise(() => {
      if (!isStringFilterOperator(filter.operator)) {
        return null;
      }

      if (filter.operator === "is-empty" || filter.operator === "not-empty") {
        return Lib.stringFilterClause({
          operator: filter.operator,
          column,
          values: [],
          options: {},
        });
      }

      if (!values.every(isStringFilterValue)) {
        return null;
      }

      return Lib.stringFilterClause({
        operator: filter.operator,
        column,
        values: [...values],
        options: {},
      });
    });
}

const isNumberFilterValue = (value: unknown): value is NumberFilterValue =>
  typeof value === "number" || typeof value === "bigint";

const isBooleanFilterValue = (value: unknown): value is boolean =>
  typeof value === "boolean";

const isStringFilterValue = (value: unknown): value is string =>
  typeof value === "string";
