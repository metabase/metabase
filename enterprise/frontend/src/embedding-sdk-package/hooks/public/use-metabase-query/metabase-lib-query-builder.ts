// eslint-disable-next-line metabase/no-external-references-for-sdk-package-code
import * as Lib from "metabase-lib";
import type {
  Aggregation,
  Field,
  StructuredDatasetQuery,
} from "metabase-types/api";

import type {
  FieldSchema,
  MetricDimensionSchema,
  TableSchema,
} from "../data-schema";

import {
  getMetricDatabaseId,
  getMetricId,
  getMetricSourceTableId,
  getTableDatabaseId,
  getTableId,
  isCountAggregation,
  isDimensionFilter,
  isFieldAggregation,
  isMeasureSchema,
  isMetricDimensionFilter,
  isMetricDimensionSchema,
  isSegmentSchema,
  isTableDimensionFilter,
  isTableFieldSchema,
  isUnaryOperator,
} from "./guards";
import { buildMetricDatasetQuery } from "./metric-query-builder";
import type {
  DimensionFilterRuntime,
  FieldAggregationRuntime,
  MetricQueryRuntime,
  TableQueryRuntime,
} from "./runtime-types";
import { buildTableDatasetQuery } from "./table-query-builder";
import {
  validateMetricTableScopedInputs,
  validateTableScopedInputs,
} from "./validation";

const STAGE_INDEX = 0;

type MetadataInput = Lib.Metadata;

type FieldWithFieldId = FieldSchema | MetricDimensionSchema;

export function buildTableDatasetQueryWithMetabaseLib(
  query: TableQueryRuntime,
): StructuredDatasetQuery | null {
  const table = getGeneratedTable(query);

  if (!table) {
    return null;
  }

  const databaseId = getTableDatabaseId(query);
  const tableId = getTableId(query);

  if (databaseId == null || tableId == null) {
    return null;
  }

  validateTableScopedInputs({
    allowedTableIds: [Number(tableId)],
    filters: query.filters,
    measures: query.aggregations ?? query.measures,
    context: "Table query",
  });

  const metadata = createTableMetadata(table, Number(databaseId));
  let libQuery = createLibQuery(metadata, Number(databaseId), Number(tableId));

  for (const filter of query.filters ?? []) {
    const filterClause = buildLibTableFilter(libQuery, filter);

    if (!filterClause) {
      return null;
    }

    libQuery = Lib.filter(libQuery, STAGE_INDEX, filterClause);
  }

  const aggregations = query.aggregations ?? query.measures;

  if (aggregations?.length) {
    for (const aggregation of aggregations) {
      const aggregationClause = buildLibAggregation(libQuery, aggregation);

      if (!aggregationClause) {
        return null;
      }

      libQuery = Lib.aggregate(libQuery, STAGE_INDEX, aggregationClause);
    }
  } else if (query.breakouts?.length) {
    libQuery = Lib.aggregateByCount(libQuery, STAGE_INDEX);
  }

  for (const breakout of query.breakouts ?? []) {
    const column = findLibColumnForBreakout(libQuery, breakout);

    if (!column) {
      return null;
    }

    libQuery = Lib.breakout(libQuery, STAGE_INDEX, column);
  }

  return normalizeDatasetQuery(
    Lib.toLegacyQuery(libQuery) as StructuredDatasetQuery,
  );
}

export function buildMetricDatasetQueryWithMetabaseLib(
  query: MetricQueryRuntime,
): StructuredDatasetQuery | null {
  validateMetricTableScopedInputs(query);

  const metricId = getMetricId(query);
  const databaseId = getMetricDatabaseId(query);
  const sourceTableId = getMetricSourceTableId(query);

  if (metricId == null || databaseId == null || sourceTableId == null) {
    return null;
  }

  const metadata = createMetricMetadata(query, Number(databaseId));
  let libQuery = createLibQuery(
    metadata,
    Number(databaseId),
    Number(sourceTableId),
  );

  const metric = Lib.availableMetrics(libQuery, STAGE_INDEX).find(
    (metricMetadata) =>
      getDisplayInfoId(libQuery, metricMetadata) === Number(metricId),
  );

  if (!metric) {
    return null;
  }

  libQuery = Lib.aggregate(libQuery, STAGE_INDEX, metric);

  for (const measure of query.measures ?? []) {
    const measureMetadata = Lib.availableMeasures(libQuery, STAGE_INDEX).find(
      (availableMeasure) =>
        getDisplayInfoId(libQuery, availableMeasure) ===
        getObjectNumber(measure, "id"),
    );

    if (!measureMetadata) {
      return null;
    }

    libQuery = Lib.aggregate(libQuery, STAGE_INDEX, measureMetadata);
  }

  for (const filter of query.filters ?? []) {
    const filterClause = buildLibMetricDatasetFilter(libQuery, filter);

    if (!filterClause) {
      return null;
    }

    libQuery = Lib.filter(libQuery, STAGE_INDEX, filterClause);
  }

  for (const breakout of query.breakouts ?? []) {
    const column = findLibColumnForBreakout(libQuery, breakout);

    if (!column) {
      return null;
    }

    libQuery = Lib.breakout(libQuery, STAGE_INDEX, column);
  }

  return normalizeMetricAggregations(
    normalizeDatasetQuery(
      Lib.toLegacyQuery(libQuery) as StructuredDatasetQuery,
    ),
  );
}

export function buildDatasetQueryWithMetabaseLib(
  query: TableQueryRuntime | MetricQueryRuntime,
): StructuredDatasetQuery {
  const datasetQuery =
    "metric" in query || "metricId" in query
      ? buildMetricDatasetQueryWithMetabaseLib(query as MetricQueryRuntime)
      : buildTableDatasetQueryWithMetabaseLib(query as TableQueryRuntime);

  if (datasetQuery) {
    return datasetQuery;
  }

  if ("metric" in query || "metricId" in query) {
    return buildMetricDatasetQuery(query as MetricQueryRuntime);
  }

  const databaseId = getTableDatabaseId(query as TableQueryRuntime);

  if (databaseId == null) {
    throw new Error(
      "Query creation requires a generated table schema, generated metric schema, or databaseId.",
    );
  }

  return {
    ...buildTableDatasetQuery(query as TableQueryRuntime),
    database: Number(databaseId),
  };
}

function buildLibTableFilter(
  query: Lib.Query,
  filter: unknown,
): Lib.ExpressionClause | Lib.SegmentMetadata | null {
  if (isSegmentSchema(filter)) {
    return Lib.segmentMetadata(query, filter.id);
  }

  if (!isDimensionFilter(filter)) {
    return null;
  }

  return buildLibFieldFilter(query, filter);
}

function buildLibMetricDatasetFilter(
  query: Lib.Query,
  filter: unknown,
): Lib.ExpressionClause | Lib.SegmentMetadata | null {
  if (isSegmentSchema(filter)) {
    return Lib.segmentMetadata(query, filter.id);
  }

  if (isMetricDimensionFilter(filter) || isTableDimensionFilter(filter)) {
    return buildLibFieldFilter(query, filter);
  }

  return null;
}

function buildLibFieldFilter(
  query: Lib.Query,
  filter: DimensionFilterRuntime,
): Lib.ExpressionClause | null {
  const column = findLibColumn(query, filter.dimension);

  if (!column) {
    return null;
  }

  const values = filter.values ?? [filter.value];

  if (isUnaryOperator(filter.operator)) {
    return Lib.defaultFilterClause({
      operator: filter.operator as never,
      column,
    });
  }

  if (filter.operator === "time-interval") {
    return null;
  }

  const jsType = getObjectString(filter.dimension, "jsType");

  if (jsType === "number") {
    return Lib.numberFilterClause({
      operator: filter.operator as never,
      column,
      values: values as never,
    });
  }

  if (jsType === "boolean") {
    return Lib.booleanFilterClause({
      operator: filter.operator as never,
      column,
      values: values as never,
    });
  }

  if (jsType === "Date") {
    return Lib.specificDateFilterClause({
      operator: filter.operator as never,
      column,
      values: values.map((value) => new Date(value as string | number | Date)),
      hasTime: true,
    });
  }

  return Lib.stringFilterClause({
    operator: filter.operator as never,
    column,
    values: values as string[],
    options: {},
  });
}

function buildLibAggregation(
  query: Lib.Query,
  aggregation: unknown,
): Lib.Aggregable | null {
  if (isCountAggregation(aggregation)) {
    return findLibAggregationClause(query, "count");
  }

  if (isFieldAggregation(aggregation)) {
    return buildLibFieldAggregation(query, aggregation);
  }

  if (isMeasureSchema(aggregation)) {
    return (
      Lib.availableMeasures(query, STAGE_INDEX).find(
        (measure) => getDisplayInfoId(query, measure) === aggregation.id,
      ) ?? null
    );
  }

  return null;
}

function buildLibFieldAggregation(
  query: Lib.Query,
  aggregation: FieldAggregationRuntime,
): Lib.AggregationClause | null {
  const column = findLibColumn(query, aggregation.dimension);

  if (!column) {
    return null;
  }

  return findLibAggregationClause(query, aggregation.type, column);
}

function findLibAggregationClause(
  query: Lib.Query,
  operatorName: string,
  column?: Lib.ColumnMetadata,
): Lib.AggregationClause | null {
  const operator = Lib.availableAggregationOperators(query, STAGE_INDEX).find(
    (operator) =>
      Lib.displayInfo(query, STAGE_INDEX, operator).shortName === operatorName,
  );

  return operator ? Lib.aggregationClause(operator, column) : null;
}

function getDisplayInfoId(
  query: Lib.Query,
  metadata: Lib.MeasureMetadata | Lib.MetricMetadata,
): unknown {
  return (
    Lib.displayInfo(query, STAGE_INDEX, metadata as never) as { id?: unknown }
  ).id;
}

function findLibColumnForBreakout(
  query: Lib.Query,
  breakout: unknown,
): Lib.ColumnMetadata | null {
  const { dimension, options } = normalizeBreakout(breakout);
  const column = findLibColumn(query, dimension);

  if (!column) {
    return null;
  }

  if (typeof options["temporal-unit"] === "string") {
    const bucket = Lib.availableTemporalBuckets(
      query,
      STAGE_INDEX,
      column,
    ).find(
      (bucket) =>
        Lib.displayInfo(query, STAGE_INDEX, bucket).shortName ===
        options["temporal-unit"],
    );

    return bucket ? Lib.withTemporalBucket(column, bucket) : null;
  }

  if (options.binning != null) {
    return null;
  }

  return column;
}

function findLibColumn(
  query: Lib.Query,
  field: unknown,
): Lib.ColumnMetadata | null {
  const fieldId = getFieldId(field);

  if (fieldId != null) {
    return Lib.fieldMetadata(query, fieldId);
  }

  if (typeof field !== "string") {
    return null;
  }

  return (
    Lib.filterableColumns(query, STAGE_INDEX).find(
      (column) => Lib.displayInfo(query, STAGE_INDEX, column).name === field,
    ) ?? null
  );
}

function createLibQuery(
  metadata: MetadataInput,
  databaseId: number,
  tableId: number,
): Lib.Query {
  const provider = Lib.metadataProvider(databaseId, metadata);
  const table = Lib.tableOrCardMetadata(provider, tableId);

  if (!table) {
    throw new Error("Query creation requires generated table metadata.");
  }

  return Lib.queryFromTableOrCardMetadata(provider, table);
}

function createTableMetadata(
  table: TableSchema,
  databaseId: number,
): MetadataInput {
  const fields = getTableFields(table);

  return {
    databases: {
      [databaseId]: createDatabaseMetadata(databaseId),
    },
    tables: {
      [table.id]: createTableMetadataRecord(table, databaseId, fields),
    },
    fields: Object.fromEntries(
      fields.map((field, index) => [
        getFieldId(field),
        createFieldMetadataRecord(field, table.id, index),
      ]),
    ),
    segments: Object.fromEntries(
      Object.values(table.segments ?? {}).map((segment) => [
        segment.id,
        {
          ...segment,
          name: `Segment ${segment.id}`,
          description: null,
          archived: false,
          table_id: table.id,
        },
      ]),
    ),
    measures: Object.fromEntries(
      Object.values(table.measures ?? {}).map((measure) => [
        measure.id,
        {
          ...measure,
          name: `Measure ${measure.id}`,
          description: null,
          archived: false,
          table_id: table.id,
        },
      ]),
    ),
  };
}

function createMetricMetadata(
  query: MetricQueryRuntime,
  databaseId: number,
): MetadataInput {
  const sourceTableId = Number(getMetricSourceTableId(query));
  const fields = getMetricDimensions(query);
  const table: TableSchema = {
    id: sourceTableId,
    databaseId,
    fields: Object.fromEntries(
      fields.map((field) => [String(getFieldId(field)), field]),
    ),
  };

  return {
    ...createTableMetadata(table, databaseId),
    metrics: {
      [Number(getMetricId(query))]: {
        id: Number(getMetricId(query)),
        name: `Metric ${String(getMetricId(query))}`,
        description: null,
        collection_id: null,
        collection: null,
        dimensions: Object.values(getObject(query.metric, "dimensions") ?? {})
          .filter(isMetricDimensionSchema)
          .map((dimension) => ({
            id: String(dimension.id),
            display_name: dimension.displayName ?? dimension.name,
            effective_type: getBaseType(dimension.jsType),
            semantic_type: null,
            sources:
              typeof dimension.fieldId === "number"
                ? [{ type: "field", "field-id": dimension.fieldId }]
                : undefined,
          })),
      },
    },
    measures: Object.fromEntries(
      query.measures?.filter(isMeasureSchema).map((measure) => [
        measure.id,
        {
          ...measure,
          name: `Measure ${measure.id}`,
          description: null,
          archived: false,
          table_id: measure.tableId,
        },
      ]) ?? [],
    ),
  };
}

function createDatabaseMetadata(databaseId: number) {
  return {
    id: databaseId,
    name: `Database ${databaseId}`,
    engine: undefined,
    details: {},
    schedules: {},
    auto_run_queries: false,
    refingerprint: false,
    cache_ttl: null,
    is_sample: false,
    is_full_sync: false,
    is_on_demand: false,
    is_saved_questions: false,
    native_permissions: "write",
    initial_sync_status: "complete",
    features: ["basic-aggregations", "binning", "expressions"],
    can_upload: false,
    uploads_enabled: false,
    uploads_schema_name: null,
    uploads_table_prefix: null,
    created_at: "2021-01-01T00:00:00",
    updated_at: "2021-01-01T00:00:00",
  };
}

function createTableMetadataRecord(
  table: TableSchema,
  databaseId: number,
  fields: FieldWithFieldId[],
) {
  return {
    id: table.id,
    db_id: databaseId,
    display_name: `Table ${table.id}`,
    name: `table_${table.id}`,
    schema: "public",
    description: null,
    active: true,
    visibility_type: null,
    field_order: "database",
    initial_sync_status: "complete",
    fields: fields.map((field, index) =>
      createFieldMetadataRecord(field, table.id, index),
    ),
    segments: Object.values(table.segments ?? {}),
    measures: Object.values(table.measures ?? {}),
  };
}

function createFieldMetadataRecord(
  field: FieldWithFieldId,
  tableId: number,
  index: number,
): Field {
  const fieldId = getFieldId(field);

  return {
    id: fieldId ?? index,
    table_id: tableId,
    name: field.name,
    display_name: field.displayName ?? field.name,
    description: field.description ?? null,
    database_type: "",
    base_type: getBaseType(field.jsType),
    effective_type: getBaseType(field.jsType),
    semantic_type: null,
    active: true,
    visibility_type: "normal",
    preview_display: true,
    position: index,
    fk_target_field_id: null,
    nfc_path: null,
    json_unfolding: null,
    coercion_strategy: null,
    fingerprint: null,
    has_field_values: "none",
    has_more_values: false,
    last_analyzed: "2021-01-01T00:00:00",
    created_at: "2021-01-01T00:00:00",
    updated_at: "2021-01-01T00:00:00",
  };
}

function getGeneratedTable(query: TableQueryRuntime): TableSchema | null {
  return typeof query.table === "object" && query.table != null
    ? (query.table as TableSchema)
    : null;
}

function getTableFields(table: TableSchema): FieldWithFieldId[] {
  return Object.values(table.fields ?? {}).filter(hasFieldId);
}

function getMetricDimensions(query: MetricQueryRuntime): FieldWithFieldId[] {
  if (typeof query.metric !== "object" || query.metric == null) {
    return [];
  }

  const dimensions = getObject(query.metric, "dimensions");

  if (!dimensions) {
    return [];
  }

  return Object.values(dimensions).filter(isMetricDimensionWithFieldId);
}

function normalizeBreakout(breakout: unknown) {
  if (
    typeof breakout === "string" ||
    isTableFieldSchema(breakout) ||
    isMetricDimensionSchema(breakout)
  ) {
    return { dimension: breakout, options: {} };
  }

  if (
    typeof breakout !== "object" ||
    breakout == null ||
    !("dimension" in breakout)
  ) {
    return { dimension: null, options: {} };
  }

  const options: Record<string, unknown> = {};

  if ("bucket" in breakout && breakout.bucket) {
    options["temporal-unit"] = breakout.bucket;
  }

  if ("binning" in breakout && breakout.binning) {
    options.binning = breakout.binning;
  }

  return { dimension: breakout.dimension, options };
}

function normalizeMetricAggregations(
  datasetQuery: StructuredDatasetQuery,
): StructuredDatasetQuery {
  return {
    ...datasetQuery,
    query: {
      ...datasetQuery.query,
      aggregation: datasetQuery.query.aggregation?.map((aggregation) => {
        if (
          Array.isArray(aggregation) &&
          aggregation[0] === "measure" &&
          aggregation.length === 2
        ) {
          return ["measure", {}, aggregation[1]] as Aggregation;
        }

        return aggregation;
      }),
    },
  };
}

function normalizeDatasetQuery(
  datasetQuery: StructuredDatasetQuery,
): StructuredDatasetQuery {
  return {
    ...datasetQuery,
    parameters: datasetQuery.parameters ?? [],
    query: stripFieldRefBaseTypes(datasetQuery.query),
  };
}

function stripFieldRefBaseTypes<TValue>(value: TValue): TValue {
  if (Array.isArray(value)) {
    if (
      value[0] === "field" &&
      typeof value[2] === "object" &&
      value[2] != null &&
      !Array.isArray(value[2])
    ) {
      const { "base-type": _baseType, ...options } = value[2] as Record<
        string,
        unknown
      >;

      return [
        value[0],
        value[1],
        stripFieldRefBaseTypes(options),
        ...value.slice(3).map(stripFieldRefBaseTypes),
      ] as TValue;
    }

    return value.map(stripFieldRefBaseTypes) as TValue;
  }

  if (typeof value === "object" && value != null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, childValue]) => [
        key,
        stripFieldRefBaseTypes(childValue),
      ]),
    ) as TValue;
  }

  return value;
}

function getBaseType(jsType: unknown): string {
  switch (jsType) {
    case "number":
      return "type/Float";
    case "boolean":
      return "type/Boolean";
    case "Date":
      return "type/DateTime";
    default:
      return "type/Text";
  }
}

function getFieldId(field: unknown): number | null {
  if (isMetricDimensionSchema(field) && typeof field.fieldId === "number") {
    return field.fieldId;
  }

  if (hasFieldId(field)) {
    return field.fieldId;
  }

  if (isTableFieldSchema(field) && typeof field.id === "number") {
    return field.id;
  }

  return null;
}

function hasFieldId(
  value: unknown,
): value is FieldSchema & { fieldId: number } {
  return (
    typeof value === "object" &&
    value != null &&
    "fieldId" in value &&
    typeof value.fieldId === "number"
  );
}

function isMetricDimensionWithFieldId(
  value: unknown,
): value is MetricDimensionSchema & { fieldId: number } {
  return isMetricDimensionSchema(value) && typeof value.fieldId === "number";
}

function getObject(
  value: unknown,
  key: string,
): Record<string, unknown> | null {
  if (typeof value !== "object" || value == null || !(key in value)) {
    return null;
  }

  const property = (value as Record<string, unknown>)[key];

  return typeof property === "object" && property != null
    ? (property as Record<string, unknown>)
    : null;
}

function getObjectNumber(value: unknown, key: string): number | undefined {
  if (typeof value !== "object" || value == null || !(key in value)) {
    return undefined;
  }

  const property = (value as Record<string, unknown>)[key];

  return typeof property === "number" ? property : undefined;
}

function getObjectString(value: unknown, key: string): string | undefined {
  if (typeof value !== "object" || value == null || !(key in value)) {
    return undefined;
  }

  const property = (value as Record<string, unknown>)[key];

  return typeof property === "string" ? property : undefined;
}
