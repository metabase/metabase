import {
  getMetricIdFromQuery,
  getMetricSourceCardIdFromQuery,
  getMetricSourceIdFromQuery,
  getMetricSourceTableIdFromQuery,
} from "embedding-sdk-shared/lib/create-metabase-query/query-accessors";
import type {
  FieldSchema,
  SegmentSchema,
  TableSchema,
} from "embedding-sdk-shared/lib/create-metabase-query/schema";
import type { Metadata as MetadataInput, Query } from "metabase-lib";
import * as Lib from "metabase-lib";
import type { Field, TableId } from "metabase-types/api";

import {
  isDimensionFilter,
  isFieldAggregation,
  isMeasureSchema,
  isSegmentSchema,
  isTableFieldSchema,
} from "../guards";
import type {
  MeasureReferenceInput,
  MetricQueryInput,
  TableQueryInput,
} from "../input-types";
import {
  getFieldId,
  getMetricDimensionValues,
  isMetricDimensionWithFieldId,
  normalizeBreakout,
} from "../query-utils";

import { getFieldBaseType, getFieldEffectiveType } from "./query-utils";

type TableMetadataSource = Omit<TableSchema, "id"> & { id: TableId };

export function createLibQuery(
  metadata: MetadataInput,
  databaseId: number,
  tableId: TableId,
): Query {
  const provider = Lib.metadataProvider(databaseId, metadata);
  const table = Lib.tableOrCardMetadata(provider, tableId);

  if (!table) {
    throw new Error("Query creation requires generated table metadata.");
  }

  return Lib.queryFromTableOrCardMetadata(provider, table);
}

export function createTableMetadata(
  table: TableMetadataSource,
  databaseId: number,
  query?: TableQueryInput,
): MetadataInput {
  const fields = getTableFields(table, query);
  const segments = getTableSegments(table, query);
  const measures = getTableMeasures(table, query);

  return {
    databases: {
      [databaseId]: createDatabaseMetadata(databaseId),
    },
    tables: {
      [table.id]: createTableMetadataRecord(
        table,
        databaseId,
        fields,
        segments,
        measures,
      ),
    },
    fields: Object.fromEntries(
      fields.map((field, index) => [
        getFieldId(field),
        createFieldMetadataRecord(field, table.id, index),
      ]),
    ),
    segments: Object.fromEntries(
      segments.map((segment) => [
        segment.id,
        createSegmentMetadataRecord(segment, table.id),
      ]),
    ),
    measures: Object.fromEntries(
      measures.map((measure) => [
        measure.id,
        createMeasureMetadataRecord(measure, table.id),
      ]),
    ),
  };
}

export function createMetricMetadata(
  query: MetricQueryInput,
  databaseId: number,
): MetadataInput {
  const metricId = Number(getMetricIdFromQuery(query));
  const sourceId = getMetricSourceIdFromQuery(query);

  const sourceTableId = getMetricSourceTableIdFromQuery(query);
  const sourceCardId = getMetricSourceCardIdFromQuery(query);

  const fields = getMetricDimensionValues(
    query.metric,
    isMetricDimensionWithFieldId,
  );

  if (sourceId == null) {
    throw new Error(
      "Metric metadata creation requires a sourceTableId or sourceCardId.",
    );
  }

  const table = {
    id: sourceId,
    databaseId,
    fields: Object.fromEntries(
      fields.map((field) => [String(getFieldId(field)), field]),
    ),
  };

  const measures = Object.fromEntries(
    query.measures
      ?.filter(isMeasureSchema)
      .map((measure) => [
        measure.id,
        createMeasureMetadataRecord(measure, measure.tableId),
      ]) ?? [],
  );

  const questionMetadata =
    sourceCardId == null
      ? {}
      : {
          [sourceCardId]: createQuestionMetadataRecord(
            Number(sourceCardId),
            databaseId,
          ),
        };

  return {
    ...createTableMetadata(table, databaseId),
    questions: {
      [metricId]: createMetricCardMetadataRecord({
        metricId,
        databaseId,
        sourceTableId: sourceTableId == null ? null : Number(sourceTableId),
        sourceCardId: sourceCardId == null ? null : Number(sourceCardId),
      }),
      ...questionMetadata,
    },
    measures,
  };
}

// These defaults are synthetic metadata-provider scaffolding. Keep generated
// schema values in the record constructors above and below this block.
const DATABASE_METADATA_DEFAULTS = {
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

const TABLE_METADATA_DEFAULTS = {
  schema: "public",
  description: null,
  active: true,
  visibility_type: null,
  field_order: "database",
  initial_sync_status: "complete",
};

const FIELD_METADATA_DEFAULTS = {
  description: null,
  database_type: "",
  semantic_type: null,
  active: true,
  visibility_type: "normal" as const,
  preview_display: true,
  fk_target_field_id: null,
  nfc_path: null,
  json_unfolding: null,
  coercion_strategy: null,
  fingerprint: null,
  has_field_values: "none" as const,
  has_more_values: false,
  last_analyzed: "2021-01-01T00:00:00",
  created_at: "2021-01-01T00:00:00",
  updated_at: "2021-01-01T00:00:00",
};

const SEGMENT_METADATA_DEFAULTS = {
  description: null,
  archived: false,
};

const MEASURE_METADATA_DEFAULTS = {
  description: null,
  archived: false,
};

const CARD_METADATA_DEFAULTS = {
  description: null,
  visualization_settings: {},
  result_metadata: [],
};

const createDatabaseMetadata = (databaseId: number) => ({
  ...DATABASE_METADATA_DEFAULTS,
  id: databaseId,
  name: `Database ${databaseId}`,
});

const createTableMetadataRecord = (
  table: TableMetadataSource,
  databaseId: number,
  fields: FieldSchema[],
  segments: SegmentSchema[],
  measures: MeasureReferenceInput[],
) => ({
  ...TABLE_METADATA_DEFAULTS,
  id: table.id,
  db_id: databaseId,
  display_name: `Table ${table.id}`,
  name: `table_${table.id}`,
  fields: fields.map((field, index) =>
    createFieldMetadataRecord(field, table.id, index),
  ),
  segments,
  measures,
});

const createFieldMetadataRecord = (
  field: FieldSchema,
  tableId: TableId,
  index: number,
): Field => ({
  ...FIELD_METADATA_DEFAULTS,

  id: getFieldId(field) ?? index,
  table_id: tableId,
  name: field.name,
  display_name: field.displayName ?? field.name,
  description: field.description ?? FIELD_METADATA_DEFAULTS.description,
  base_type: getFieldBaseType(field),
  effective_type: getFieldEffectiveType(field),
  position: index,
});

const createSegmentMetadataRecord = (
  segment: SegmentSchema,
  tableId: TableId,
) => ({
  ...SEGMENT_METADATA_DEFAULTS,
  ...segment,
  name: `Segment ${segment.id}`,
  table_id: tableId,
});

const createMeasureMetadataRecord = (
  measure: MeasureReferenceInput,
  tableId: TableId,
) => ({
  ...MEASURE_METADATA_DEFAULTS,
  ...measure,
  name: `Measure ${measure.id}`,
  table_id: tableId,
});

const createQuestionMetadataRecord = (cardId: number, databaseId: number) => ({
  ...CARD_METADATA_DEFAULTS,
  id: cardId,
  name: `Question ${cardId}`,
  display: "table",
  type: "question",
  dataset_query: {
    type: "query",
    database: databaseId,
    query: {
      "source-table": `card__${cardId}`,
    },
  },
});

const createMetricCardMetadataRecord = ({
  metricId,
  databaseId,
  sourceTableId,
  sourceCardId,
}: {
  metricId: number;
  databaseId: number;
  sourceTableId: number | null;
  sourceCardId: number | null;
}) => ({
  ...CARD_METADATA_DEFAULTS,
  id: metricId,
  name: `Metric ${metricId}`,
  display: "scalar",
  type: "metric",
  table_id: sourceTableId,
  source_card_id: sourceCardId,
  archived: false,
  dataset_query: {
    type: "query",
    database: databaseId,
    query: {
      "source-table":
        sourceTableId == null ? `card__${sourceCardId}` : sourceTableId,
    },
  },
});

const getTableFields = (
  table: TableMetadataSource,
  query?: TableQueryInput,
): FieldSchema[] =>
  getUniqueFields([
    ...Object.values(table.fields ?? {}).filter(hasFieldReferenceId),
    ...getQueryFieldReferences(query),
  ]);

const getTableSegments = (
  table: TableMetadataSource,
  query?: TableQueryInput,
): SegmentSchema[] =>
  getUniqueById([
    ...Object.values(table.segments ?? {}),
    ...(query?.filters?.filter(isSegmentSchema) ?? []),
  ]);

const getTableMeasures = (
  table: TableMetadataSource,
  query?: TableQueryInput,
): MeasureReferenceInput[] =>
  getUniqueById([
    ...Object.values(table.measures ?? {}),
    ...getQueryAggregations(query).filter(isMeasureSchema),
  ]);

function getQueryFieldReferences(query?: TableQueryInput): FieldSchema[] {
  const filterFields =
    query?.filters?.flatMap((filter) =>
      isDimensionFilter(filter) && isTableFieldSchema(filter.dimension)
        ? [filter.dimension]
        : [],
    ) ?? [];

  const aggregationFields = getQueryAggregations(query).flatMap((aggregation) =>
    isFieldAggregation(aggregation) && isTableFieldSchema(aggregation.dimension)
      ? [aggregation.dimension]
      : [],
  );

  const breakoutFields =
    query?.breakouts?.flatMap((breakout) => {
      const { dimension } = normalizeBreakout(breakout);

      return dimension && isTableFieldSchema(dimension) ? [dimension] : [];
    }) ?? [];

  return [...filterFields, ...aggregationFields, ...breakoutFields].filter(
    hasFieldReferenceId,
  );
}

const getQueryAggregations = (query?: TableQueryInput): readonly unknown[] =>
  query?.aggregations ?? query?.measures ?? [];

function getUniqueById<T extends { id: number }>(items: readonly T[]): T[] {
  return Array.from(new Map(items.map((item) => [item.id, item])).values());
}

function getUniqueFields(fields: readonly FieldSchema[]): FieldSchema[] {
  return Array.from(
    new Map(fields.map((field) => [getFieldId(field), field])).values(),
  );
}

function hasFieldReferenceId(field: FieldSchema): boolean {
  return getFieldId(field) != null;
}
