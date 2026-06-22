import { match } from "ts-pattern";

import type {
  ColumnMetadata,
  ExpressionClause,
  NumberFilterValue,
  Query,
  SegmentMetadata,
} from "metabase-lib";
import * as Lib from "metabase-lib";
import { isObject } from "metabase-types/guards";

import {
  isDimensionFilter,
  isSegmentSchema,
  isTableDimensionFilter,
  isTableFieldSchema,
} from "../guards";
import type { DimensionFilterInput } from "../input-types";
import { isColumnReference } from "../query-utils";

import { findLibColumn } from "./column";
import {
  isBooleanFilterOperator,
  isDefaultFilterOperator,
  isNumberFilterOperator,
  isSpecificDateFilterOperator,
  isStringFilterOperator,
} from "./operators";
import { fieldHasTime } from "./query-utils";

const STAGE_INDEX = 0;

type FilterBuilder = (
  query: Query,
  filter: unknown,
) => ExpressionClause | SegmentMetadata | null;

type RelativeDateFilterParts = {
  value: number;
  unit: Lib.RelativeDateFilterUnit;
  offsetValue: number | null;
  offsetUnit: Lib.RelativeDateFilterUnit | null;
  options: Lib.RelativeDateFilterOptions;
};

type RelativeDateFilterInput = {
  value: number;
  unit: Lib.RelativeDateFilterUnit;
  options: Record<string, unknown>;
  offsetValue?: number;
  offsetUnit?: Lib.RelativeDateFilterUnit;
};

const RELATIVE_DATE_FILTER_UNITS = new Set<string>([
  "minute",
  "hour",
  "day",
  "week",
  "month",
  "quarter",
  "year",
]);

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
      if (!isSpecificDateFilterOperator(filter.operator)) {
        return null;
      }

      return Lib.specificDateFilterClause({
        operator: filter.operator,
        column,
        values: values.map(
          (value) => new Date(value as string | number | Date),
        ),
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

function buildLibRelativeDateFilter(
  filter: DimensionFilterInput,
  column: ColumnMetadata,
): ExpressionClause | null {
  const parts = getRelativeDateFilterParts(filter);

  if (!parts) {
    return null;
  }

  return Lib.relativeDateFilterClause({
    column,
    ...parts,
  });
}

function getRelativeDateFilterParts(
  filter: DimensionFilterInput,
): RelativeDateFilterParts | null {
  const values =
    filter.values ?? (Array.isArray(filter.value) ? filter.value : null);

  if (values) {
    const [value, unit, options, offsetValue, offsetUnit] = values;

    return createRelativeDateFilterParts(
      parseRelativeDateFilterInput({
        value,
        unit,
        options,
        offsetValue,
        offsetUnit,
      }),
    );
  }

  if (!isObject(filter.value)) {
    return null;
  }

  return createRelativeDateFilterParts(
    parseRelativeDateFilterInput({
      value: filter.value.value,
      unit: filter.value.unit,
      options: filter.value.options,
      offsetValue: filter.value.offsetValue,
      offsetUnit: filter.value.offsetUnit,
    }),
  );
}

function createRelativeDateFilterParts(
  input: RelativeDateFilterInput | null,
): RelativeDateFilterParts | null {
  if (!input) {
    return null;
  }

  const { value, unit, options, offsetValue, offsetUnit } = input;

  const parsedOffsetValue =
    typeof offsetValue === "number"
      ? offsetValue
      : (getNumberOption(options, "offsetValue") ?? null);

  const optionsOffsetUnit = getStringOption(options, "offsetUnit");

  const parsedOffsetUnit = isRelativeDateFilterUnit(offsetUnit)
    ? offsetUnit
    : isRelativeDateFilterUnit(optionsOffsetUnit)
      ? optionsOffsetUnit
      : null;

  return {
    value,
    unit,
    offsetValue: parsedOffsetValue,
    offsetUnit: parsedOffsetUnit,
    options: getRelativeDateFilterOptions(options),
  };
}

function parseRelativeDateFilterInput({
  value,
  unit,
  options,
  offsetValue,
  offsetUnit,
}: {
  value: unknown;
  unit: unknown;
  options?: unknown;
  offsetValue?: unknown;
  offsetUnit?: unknown;
}): RelativeDateFilterInput | null {
  if (typeof value !== "number" || !isRelativeDateFilterUnit(unit)) {
    return null;
  }

  return {
    value,
    unit,
    options: isObject(options) ? options : {},
    offsetValue: typeof offsetValue === "number" ? offsetValue : undefined,
    offsetUnit: isRelativeDateFilterUnit(offsetUnit) ? offsetUnit : undefined,
  };
}

function getRelativeDateFilterOptions(
  options: Record<string, unknown>,
): Lib.RelativeDateFilterOptions {
  const includeCurrent = getBooleanOption(options, "includeCurrent");

  return includeCurrent === true ? { includeCurrent: true } : {};
}

const getBooleanOption = (
  options: Record<string, unknown>,
  key: string,
): boolean | null => (typeof options[key] === "boolean" ? options[key] : null);

const getNumberOption = (
  options: Record<string, unknown>,
  key: string,
): number | null => (typeof options[key] === "number" ? options[key] : null);

const getStringOption = (
  options: Record<string, unknown>,
  key: string,
): string | null => (typeof options[key] === "string" ? options[key] : null);

const isRelativeDateFilterUnit = (
  value: unknown,
): value is Lib.RelativeDateFilterUnit =>
  typeof value === "string" && RELATIVE_DATE_FILTER_UNITS.has(value);

const isNumberFilterValue = (value: unknown): value is NumberFilterValue =>
  typeof value === "number" || typeof value === "bigint";

const isBooleanFilterValue = (value: unknown): value is boolean =>
  typeof value === "boolean";

const isStringFilterValue = (value: unknown): value is string =>
  typeof value === "string";
