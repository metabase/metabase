import type {
  Aggregation,
  ConcreteFieldReference,
  FieldReference,
  Filter,
  StructuredDatasetQuery,
} from "metabase-types/api";

import {
  getMetricDatabaseId,
  getMetricId,
  getMetricSourceCardId,
  getMetricSourceTableId,
  isFieldSchema,
  isMeasureSchema,
  isSegmentSchema,
  isTableDimensionFilter,
  isTableFieldSchema,
  isUnaryOperator,
} from "./guards";
import type {
  BreakoutObjectRuntime,
  DimensionFilterRuntime,
  MetricQueryRuntime,
} from "./runtime-types";
import { validateMetricTableScopedInputs } from "./validation";

export function buildMetricDatasetQuery(
  query: MetricQueryRuntime,
): StructuredDatasetQuery {
  validateMetricTableScopedInputs(query);

  const metricId = getMetricId(query);
  const databaseId = getMetricDatabaseId(query);
  const sourceTableId = getMetricSourceTableId(query);
  const sourceCardId = getMetricSourceCardId(query);

  const sourceTable =
    sourceTableId != null
      ? Number(sourceTableId)
      : sourceCardId != null
        ? `card__${sourceCardId}`
        : null;

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

  const filters = query.filters?.map((filter) => {
    return buildMetricDatasetFilter(filter, query);
  });
  const breakouts = query.breakouts?.map((breakout) => {
    return buildMetricDatasetBreakout(breakout, query);
  });

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

function validateMetricDimensionForTableField(
  query: MetricQueryRuntime,
  field: unknown,
) {
  const dimension = getMetricDimensionFields(query).find((dimension) => {
    return fieldsMatch(dimension, field);
  });

  if (!dimension) {
    throw new Error(
      "Metric query table-field filters must match a generated metric dimension for the metric. Use schema.metrics.*.dimensions.* or pass the full generated metric object.",
    );
  }
}

function getMetricDimensionFields(query: MetricQueryRuntime) {
  const metric = query.metric;

  if (typeof metric !== "object" || metric == null) {
    return [];
  }

  const dimensions =
    "dimensions" in metric
      ? (metric as Record<string, unknown>).dimensions
      : undefined;

  if (!isRecord(dimensions)) {
    return [];
  }

  return Object.values(dimensions).flatMap((dimensionOrGroup) => {
    if (isTableFieldSchema(dimensionOrGroup)) {
      return [dimensionOrGroup];
    }

    if (isRecord(dimensionOrGroup)) {
      return Object.values(dimensionOrGroup).filter(isTableFieldSchema);
    }

    return [];
  });
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

function fieldsMatch(left: unknown, right: unknown) {
  const leftTableId = getObjectNumber(left, "tableId");
  const rightTableId = getObjectNumber(right, "tableId");
  const leftFieldId = getObjectNumber(left, "fieldId");
  const rightFieldId = getObjectNumber(right, "fieldId");
  const leftName = getObjectString(left, "name");
  const rightName = getObjectString(right, "name");

  return (
    leftTableId === rightTableId &&
    ((leftFieldId != null && leftFieldId === rightFieldId) ||
      (leftName != null && leftName === rightName))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value != null;
}

function buildMetricDatasetBreakout(
  breakout: unknown,
  query: MetricQueryRuntime,
): ConcreteFieldReference {
  const { dimension, options } = normalizeBreakout(breakout);

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

function normalizeBreakout(breakout: unknown) {
  if (typeof breakout === "string" || isFieldSchema(breakout)) {
    return { dimension: breakout, options: {} };
  }

  if (!isBreakoutObject(breakout)) {
    throw new Error(
      "Metric query breakouts must use generated metric dimensions, not dimension name strings.",
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

const isBreakoutObject = (value: unknown): value is BreakoutObjectRuntime =>
  typeof value === "object" && value != null && "dimension" in value;

const hasFieldId = (value: unknown): value is { fieldId: number } =>
  typeof value === "object" &&
  value != null &&
  "fieldId" in value &&
  typeof value.fieldId === "number";
