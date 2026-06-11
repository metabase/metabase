import type {
  Aggregation,
  ConcreteFieldReference,
  FieldReference,
  Filter,
  MetricId,
  StructuredDatasetQuery,
} from "metabase-types/api";
import type {
  InstanceFilter,
  JsMetricDefinition,
  TypedProjection,
} from "metabase-types/api/metric";

import {
  getMetricDatabaseId,
  getMetricId,
  getMetricSourceTableId,
  isFieldSchema,
  isMeasureSchema,
  isMetricDimensionFilter,
  isMetricDimensionSchema,
  isSegmentSchema,
  isTableDimensionFilter,
  isTableFieldSchema,
  isUnaryOperator,
} from "./guards";
import type {
  BreakoutObjectRuntime,
  DimensionFilterRuntime,
  MetricDimensionFilterRuntime,
  MetricQueryRuntime,
} from "./runtime-types";
import { validateMetricTableScopedInputs } from "./validation";

export function buildMetricDefinition(query: MetricQueryRuntime) {
  validateMetricTableScopedInputs(query);

  const metricId = Number(getMetricId(query)) as MetricId;
  const uuid = "metric";
  const definition: JsMetricDefinition = {
    expression: ["metric", { "lib/uuid": uuid }, metricId],
  };

  const filters = query.filters?.map((filter) => {
    return buildMetricFilter(filter, query, uuid);
  });

  if (filters?.length) {
    definition.filters = filters;
  }

  if (query.breakouts?.length) {
    definition.projections = [
      {
        type: "metric",
        id: metricId,
        "lib/uuid": uuid,
        projection: query.breakouts.map((breakout) => {
          return buildMetricBreakout(breakout);
        }),
      } satisfies TypedProjection,
    ];
  }

  const measures = query.measures?.filter(isMeasureSchema);

  if (measures?.length) {
    definition.measures = measures.map((measure) => measure.id);
  }

  return definition;
}

export function buildMetricDatasetQuery(
  query: MetricQueryRuntime,
): StructuredDatasetQuery {
  validateMetricTableScopedInputs(query);

  const metricId = getMetricId(query);
  const databaseId = getMetricDatabaseId(query);
  const sourceTableId = getMetricSourceTableId(query);

  if (metricId == null || databaseId == null || sourceTableId == null) {
    throw new Error(
      "Metric query object creation requires a generated metric schema with databaseId and sourceTableId.",
    );
  }

  const mbql: StructuredDatasetQuery["query"] = {
    "source-table": Number(sourceTableId),
    aggregation: [
      ["metric", Number(metricId)],
      ...buildMetricDatasetMeasureClauses(query),
    ],
  };

  const filters = query.filters?.map(buildMetricDatasetFilter);
  const breakouts = query.breakouts?.map(buildMetricDatasetBreakout);

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

function buildMetricFilter(
  filter: unknown,
  query: MetricQueryRuntime,
  uuid: string,
): InstanceFilter {
  if (isSegmentSchema(filter)) {
    return {
      "lib/uuid": uuid,
      filter: ["segment", {}, filter.id],
    };
  }

  if (isMetricDimensionFilter(filter)) {
    return {
      "lib/uuid": uuid,
      filter: buildMetricFilterClause(filter),
    };
  }

  if (isTableDimensionFilter(filter)) {
    const dimension = findMetricDimensionForTableField(query, filter.dimension);

    return {
      "lib/uuid": uuid,
      filter: buildMetricFilterClause({ ...filter, dimension }),
    };
  }

  throw new Error(
    "Metric query filters must use generated metric dimensions, mapped table fields, or segments.",
  );
}

function buildMetricFilterClause(filter: MetricDimensionFilterRuntime) {
  const operator = filter.operator;
  const dimension = buildMetricDimensionReference(filter.dimension);
  const values = filter.values ?? [filter.value];

  if (operator === "between") {
    return [operator, {}, dimension, ...values.slice(0, 2)];
  }

  if (isUnaryOperator(operator)) {
    return [operator, {}, dimension];
  }

  return [operator, {}, dimension, ...values];
}

function buildMetricDatasetFilter(filter: unknown) {
  if (isSegmentSchema(filter)) {
    return ["segment", filter.id];
  }

  if (isMetricDimensionFilter(filter) || isTableDimensionFilter(filter)) {
    return buildMetricDatasetFilterClause(filter);
  }

  throw new Error(
    "Metric query object filters must use generated metric dimensions, mapped table fields, or segments.",
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

function findMetricDimensionForTableField(
  query: MetricQueryRuntime,
  field: unknown,
) {
  const dimensions = getMetricDimensions(query);
  const dimension = dimensions.find((dimension) => {
    return (
      dimension.tableId === getObjectNumber(field, "tableId") &&
      dimension.name === getObjectString(field, "name")
    );
  });

  if (!dimension) {
    throw new Error(
      "Metric query table-field filters must match a generated metric dimension for the metric. Use schema.metrics.*.dimensions.* or pass the full generated metric object.",
    );
  }

  return dimension;
}

function getMetricDimensions(query: MetricQueryRuntime) {
  const metric = query.metric;

  if (
    typeof metric !== "object" ||
    metric == null ||
    !("dimensions" in metric)
  ) {
    return [];
  }

  const dimensions = metric.dimensions;

  if (typeof dimensions !== "object" || dimensions == null) {
    return [];
  }

  return Object.values(dimensions).filter(isMetricDimensionSchema);
}

function getObjectNumber(value: unknown, key: string) {
  if (typeof value !== "object" || value == null || !(key in value)) {
    return undefined;
  }

  const property = (value as Record<string, unknown>)[key];

  return typeof property === "number" ? property : undefined;
}

function getObjectString(value: unknown, key: string) {
  if (typeof value !== "object" || value == null || !(key in value)) {
    return undefined;
  }

  const property = (value as Record<string, unknown>)[key];

  return typeof property === "string" ? property : undefined;
}

function buildMetricBreakout(breakout: unknown) {
  const { dimension, options } = normalizeBreakout(breakout);

  return buildMetricDimensionReference(dimension, options);
}

function buildMetricDimensionReference(
  dimension: unknown,
  options: Record<string, unknown> = {},
) {
  if (typeof dimension === "string") {
    throw new Error(
      "Metric query dimensions must use generated metric dimension objects, not dimension name strings.",
    );
  }

  return [
    "dimension",
    options,
    isTableFieldSchema(dimension) && typeof dimension.fieldId === "number"
      ? dimension.fieldId
      : isFieldSchema(dimension)
        ? dimension.id
        : dimension,
  ];
}

function buildMetricDatasetBreakout(breakout: unknown): ConcreteFieldReference {
  const { dimension, options } = normalizeBreakout(breakout);

  return buildDatasetFieldReference(
    dimension,
    options,
  ) as ConcreteFieldReference;
}

function buildDatasetFieldReference(
  field: unknown,
  options: Record<string, unknown> = {},
): FieldReference {
  if (isMetricDimensionSchema(field) && typeof field.fieldId === "number") {
    return ["field", field.fieldId, options] as FieldReference;
  }

  if (hasFieldId(field)) {
    return ["field", field.fieldId, options] as FieldReference;
  }

  throw new Error(
    "Metric query objects for InteractiveQuestion require generated dimensions with fieldId. Use schema.tables.*.fields.* or regenerate the typed schema.",
  );
}

function normalizeBreakout(breakout: unknown) {
  if (
    typeof breakout === "string" ||
    isFieldSchema(breakout) ||
    isMetricDimensionSchema(breakout)
  ) {
    return { dimension: breakout, options: {} };
  }

  if (!isBreakoutObject(breakout)) {
    throw new Error(
      "Metric query breakouts must use generated metric dimension objects, not dimension name strings.",
    );
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

function hasFieldId(value: unknown): value is { fieldId: number } {
  return (
    typeof value === "object" &&
    value != null &&
    "fieldId" in value &&
    typeof value.fieldId === "number"
  );
}
