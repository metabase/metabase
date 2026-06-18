import type {
  Aggregation,
  ConcreteFieldReference,
  FieldReference,
  Filter,
  StructuredDatasetQuery,
} from "metabase-types/api";

import {
  getTableId,
  isCountAggregation,
  isDimensionFilter,
  isFieldAggregation,
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
    measures: query.aggregations ?? query.measures,
    context: "Table query",
  });

  const mbql: StructuredDatasetQuery["query"] = {
    "source-table": Number(tableId),
  };

  const filters = query.filters?.map(buildTableFilter).filter(Boolean);
  const aggregations = buildTableAggregationClauses(query);
  const breakouts = query.breakouts?.map(buildTableBreakout).filter(Boolean);

  if (filters?.length === 1) {
    mbql.filter = filters[0] as Filter;
  } else if (filters && filters.length > 1) {
    mbql.filter = ["and", ...(filters as Filter[])];
  }

  if (aggregations.length > 0) {
    mbql.aggregation = aggregations;
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

function buildTableAggregationClauses(query: TableQueryRuntime): Aggregation[] {
  const aggregations = query.aggregations ?? query.measures;
  const clauses = aggregations?.map(buildAggregationClause).filter(isNotNull);

  if (clauses?.length) {
    return clauses;
  }

  return query.breakouts?.length ? [buildCountClause()] : [];
}

function buildAggregationClause(aggregation: unknown): Aggregation | null {
  if (isCountAggregation(aggregation)) {
    return buildCountClause();
  }

  if (isFieldAggregation(aggregation)) {
    return [
      aggregation.type,
      buildFieldReference(aggregation.dimension),
    ] as Aggregation;
  }

  if (!isMeasureSchema(aggregation)) {
    return null;
  }

  return ["measure", {}, aggregation.id] as Aggregation;
}

const buildCountClause = (): Aggregation => ["count"] as Aggregation;

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

const isBreakoutObject = (value: unknown): value is BreakoutObjectRuntime =>
  typeof value === "object" && value != null && "dimension" in value;

const isNotNull = <TValue>(value: TValue | null): value is TValue =>
  value !== null;
