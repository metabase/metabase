import type {
  Aggregation,
  ConcreteFieldReference,
  FieldReference,
  Filter,
  StructuredDatasetQuery,
} from "metabase-types/api";

import {
  getTableId,
  isDimensionFilter,
  isMeasureSchema,
  isMetricDimensionSchema,
  isSegmentSchema,
  isTableFieldSchema,
  isUnaryOperator,
} from "./guards";
import type {
  BreakoutObjectRuntime,
  DimensionFilterRuntime,
  TableQueryRuntime,
} from "./runtime-types";
import { validateTableScopedInputs } from "./validation";

export function buildTableDatasetQuery(
  query: TableQueryRuntime,
): Omit<StructuredDatasetQuery, "database"> {
  const tableId = getTableId(query);

  if (tableId == null) {
    throw new Error(
      "Table query requires a generated table schema or tableId.",
    );
  }

  validateTableScopedInputs({
    allowedTableIds: [Number(tableId)],
    filters: query.filters,
    measures: query.measures,
    context: "Table query",
  });

  const mbql: StructuredDatasetQuery["query"] = {
    "source-table": Number(tableId),
  };

  const filters = query.filters?.map(buildTableFilter).filter(Boolean);
  const measures = query.measures?.map(buildMeasureClause).filter(isNotNull);
  const breakouts = query.breakouts?.map(buildTableBreakout).filter(Boolean);

  if (filters?.length === 1) {
    mbql.filter = filters[0] as Filter;
  } else if (filters && filters.length > 1) {
    mbql.filter = ["and", ...(filters as Filter[])];
  }

  if (measures?.length) {
    mbql.aggregation = measures;
  }

  if (breakouts?.length) {
    mbql.breakout = breakouts;
  }

  return {
    type: "query",
    query: mbql,
    parameters: [],
  };
}

function buildTableFilter(filter: unknown) {
  if (isSegmentSchema(filter)) {
    return ["segment", filter.id];
  }

  if (isDimensionFilter(filter)) {
    return buildFieldFilterClause(filter);
  }

  return null;
}

function buildMeasureClause(measure: unknown): Aggregation | null {
  if (!isMeasureSchema(measure)) {
    return null;
  }

  return ["measure", {}, measure.id] as Aggregation;
}

function buildTableBreakout(breakout: unknown): ConcreteFieldReference {
  const { dimension, options } = normalizeBreakout(breakout);

  return buildFieldReference(dimension, options) as ConcreteFieldReference;
}

function buildFieldFilterClause(filter: DimensionFilterRuntime) {
  const operator = filter.operator;
  const dimension = buildFieldReference(filter.dimension);
  const values = filter.values ?? [filter.value];

  if (operator === "between") {
    return [operator, dimension, ...values.slice(0, 2)];
  }

  if (isUnaryOperator(operator)) {
    return [operator, dimension];
  }

  return [operator, dimension, ...values];
}

function buildFieldReference(
  field: unknown,
  options: Record<string, unknown> = {},
): FieldReference {
  if (isTableFieldSchema(field) && typeof field.fieldId === "number") {
    return ["field", field.fieldId, options] as FieldReference;
  }

  if (isTableFieldSchema(field) && typeof field.id === "number") {
    return ["field", field.id, options] as FieldReference;
  }

  if (typeof field === "object" && field != null) {
    throw new Error(
      "Table query fields must use generated table field objects from schema.tables.*.fields.*.",
    );
  }

  return ["field", String(field), options] as FieldReference;
}

function normalizeBreakout(breakout: unknown) {
  if (
    typeof breakout === "string" ||
    isTableFieldSchema(breakout) ||
    isMetricDimensionSchema(breakout)
  ) {
    return { dimension: breakout, options: {} };
  }

  if (!isBreakoutObject(breakout)) {
    throw new Error("Table query breakouts must use generated field objects.");
  }

  const options: Record<string, unknown> = {};

  if (breakout.bucket) {
    options["temporal-unit"] = breakout.bucket;
  }

  if (breakout.binning) {
    options.binning = breakout.binning;
  }

  return { dimension: breakout.dimension, options };
}

function isBreakoutObject(value: unknown): value is BreakoutObjectRuntime {
  return typeof value === "object" && value != null && "dimension" in value;
}

function isNotNull<TValue>(value: TValue | null): value is TValue {
  return value !== null;
}
