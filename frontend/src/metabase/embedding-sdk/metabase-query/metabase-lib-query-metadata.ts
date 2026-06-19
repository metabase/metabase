import type { Field } from "metabase-types/api";

import { getMetricId, getMetricSourceTableId } from "./accessors";
import { isMeasureSchema } from "./guards";
import type { MetadataInput, Query } from "./metabase-lib-query-lib";
import { Lib } from "./metabase-lib-query-lib";
import type { FieldWithFieldId } from "./metabase-lib-query-utils";
import {
  getFieldBaseType,
  getFieldEffectiveType,
  getFieldId,
  getObject,
  hasFieldId,
  isMetricDimensionWithFieldId,
} from "./metabase-lib-query-utils";
import type { MetricQueryRuntime } from "./runtime-types";
import type { TableSchema } from "./schema";

export function createLibQuery(
  metadata: MetadataInput,
  databaseId: number,
  tableId: number,
): Query {
  const provider = Lib.metadataProvider(databaseId, metadata);
  const table = Lib.tableOrCardMetadata(provider, tableId);

  if (!table) {
    throw new Error("Query creation requires generated table metadata.");
  }

  return Lib.queryFromTableOrCardMetadata(provider, table);
}

export function createTableMetadata(
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

export function createMetricMetadata(
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
        dimensions: getMetricDimensions(query).map((dimension) => ({
          id: String(dimension.id ?? dimension.fieldId),
          display_name: dimension.displayName ?? dimension.name,
          effective_type: getFieldEffectiveType(dimension),
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

const createDatabaseMetadata = (databaseId: number) => ({
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
});

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
    base_type: getFieldBaseType(field),
    effective_type: getFieldEffectiveType(field),
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

const getTableFields = (table: TableSchema): FieldWithFieldId[] =>
  Object.values(table.fields ?? {}).filter(hasFieldId);

function getMetricDimensions(query: MetricQueryRuntime): FieldWithFieldId[] {
  if (typeof query.metric !== "object" || query.metric == null) {
    return [];
  }

  const dimensions = getObject(query.metric, "dimensions");

  if (!dimensions) {
    return [];
  }

  return Object.values(dimensions).flatMap((dimensionOrGroup) => {
    if (isMetricDimensionWithFieldId(dimensionOrGroup)) {
      return [dimensionOrGroup];
    }

    if (typeof dimensionOrGroup !== "object" || dimensionOrGroup == null) {
      return [];
    }

    return Object.values(dimensionOrGroup).filter(isMetricDimensionWithFieldId);
  });
}
