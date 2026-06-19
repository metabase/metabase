import type {
  Aggregation,
  ConcreteFieldReference,
  FieldReference,
  Filter,
  StructuredDatasetQuery,
} from "metabase-types/api";

import {
  getMetricDatabaseIdFromQuery,
  getMetricIdFromQuery,
  getMetricSourceIdFromQuery,
} from "./accessors";
import {
  isMeasureSchema,
  isSegmentSchema,
  isTableDimensionFilter,
  isTableFieldSchema,
  isUnaryOperator,
} from "./guards";
import {
  getObjectNumber,
  hasFieldId,
  normalizeBreakout,
} from "./metabase-lib-query-utils";
import type {
  DimensionFilterRuntime,
  MetricQueryRuntime,
} from "./runtime-types";
import {
  validateMetricDimensionForTableField,
  validateMetricTableScopedInputs,
} from "./validation";

export function buildMetricDatasetQuery(
  query: MetricQueryRuntime,
): StructuredDatasetQuery {
  validateMetricTableScopedInputs(query);

  const metricId = getMetricIdFromQuery(query);
  const databaseId = getMetricDatabaseIdFromQuery(query);
  const sourceTable = getMetricSourceIdFromQuery(query);

  if (metricId == null || databaseId == null || sourceTable == null) {
    throw new Error(
      "Metric query object creation requires a generated metric schema with databaseId and sourceTableId or sourceCardId.",
    );
  }

  const mbql: StructuredDatasetQuery["query"] = {
    "source-table": sourceTable,

    aggregation: [
      ["metric", Number(metricId)],
      ...buildMetricDatasetMeasureClauses(query),
    ],
  };

  const filters = query.filters?.map((filter) =>
    buildMetricDatasetFilter(filter, query),
  );

  const breakouts = query.breakouts?.map((breakout) =>
    buildMetricDatasetBreakout(breakout, query),
  );

  if (filters?.length === 1) {
    mbql.filter = filters[0] as Filter;
  } else if (filters && filters.length > 1) {
    mbql.filter = ["and", ...(filters as Filter[])];
  }

  if (breakouts?.length) {
    mbql.breakout = breakouts;
  }

  return {
    type: "query",
    database: Number(databaseId),
    query: mbql,
    parameters: [],
  };
}

function buildMetricDatasetFilter(filter: unknown, query: MetricQueryRuntime) {
  if (isSegmentSchema(filter)) {
    return ["segment", filter.id];
  }

  if (isTableDimensionFilter(filter)) {
    validateMetricDimensionForTableField(query, filter.dimension);
    return buildMetricDatasetFilterClause(filter);
  }

  throw new Error(
    "Metric query filters must use generated metric dimensions or segments.",
  );
}

function buildMetricDatasetFilterClause(filter: DimensionFilterRuntime) {
  const operator = filter.operator;
  const dimension = buildDatasetFieldReference(filter.dimension);
  const values = filter.values ?? [filter.value];

  if (operator === "between") {
    return [operator, dimension, ...values.slice(0, 2)];
  }

  if (isUnaryOperator(operator)) {
    return [operator, dimension];
  }

  return [operator, dimension, ...values];
}

function buildMetricDatasetMeasureClauses(
  query: MetricQueryRuntime,
): Aggregation[] {
  const measures = query.measures?.filter(isMeasureSchema);

  return (
    measures?.map((measure) => {
      return ["measure", {}, measure.id] as Aggregation;
    }) ?? []
  );
}

function buildMetricDatasetBreakout(
  breakout: unknown,
  query: MetricQueryRuntime,
): ConcreteFieldReference {
  const { dimension, options } = normalizeBreakout(breakout);

  if (dimension == null) {
    throw new Error(
      "Metric query breakouts must use generated metric dimensions, not dimension name strings.",
    );
  }

  if (isTableFieldSchema(dimension)) {
    validateMetricDimensionForTableField(query, dimension);
  }

  return buildDatasetFieldReference(
    dimension,
    options,
  ) as ConcreteFieldReference;
}

function buildDatasetFieldReference(
  field: unknown,
  options: Record<string, unknown> = {},
): FieldReference {
  if (hasFieldId(field)) {
    const sourceFieldId = getObjectNumber(field, "sourceFieldId");

    const fieldOptions =
      sourceFieldId == null
        ? options
        : { ...options, "source-field": sourceFieldId };

    return ["field", field.fieldId, fieldOptions] as FieldReference;
  }

  throw new Error(
    "Metric query objects for InteractiveQuestion require generated metric dimensions with fieldId. Use schema.metrics.*.dimensions.* or regenerate the typed schema.",
  );
}
