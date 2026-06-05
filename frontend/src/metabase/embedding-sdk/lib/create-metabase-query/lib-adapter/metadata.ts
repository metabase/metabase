import {
  getMetricIdFromInput,
  getMetricSourceCardIdFromInput,
  getMetricSourceIdFromInput,
  getMetricSourceTableIdFromInput,
} from "embedding-sdk-shared/lib/create-metabase-query/input-accessors";
import { isTableFieldSchema } from "embedding-sdk-shared/lib/create-metabase-query/input-guards";
import type {
  FieldSchema,
  SegmentSchema,
  TableSchema,
} from "embedding-sdk-shared/lib/create-metabase-query/schema";
import type { Metadata as MetadataInput, Query } from "metabase-lib";
import * as Lib from "metabase-lib";
import { getQuestionVirtualTableId } from "metabase-lib/v1/metadata/utils/saved-questions";
import type { TableId } from "metabase-types/api";

import {
  isDimensionFilter,
  isFieldAggregation,
  isMeasureSchema,
  isSegmentSchema,
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
} from "../input-utils";

import { getFieldBaseType, getFieldEffectiveType } from "./query-utils";

type TableMetadataSource = Omit<TableSchema, "id"> & { id: TableId };
type QueryMetadataInput = TableQueryInput | MetricQueryInput;

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

// -------------
// TODO(EMB-1947): these synthetic metadata are temporary.
//
// We will fetch query metadata at runtime and pass them as
// metadata provider to metabase-lib - and rewrite this file.
// -------------

export function createTableMetadata(
  table: TableMetadataSource,
  databaseId: number,
  query?: QueryMetadataInput,
): MetadataInput {
  const fields = getTableFields(table, query);
  const segments = getTableSegments(table, query);
  const measures = getTableMeasures(table, query);

  return {
    databases: { [databaseId]: createDatabaseMetadata(databaseId) },
    tables: { [table.id]: createTableMetadataRecord(table, databaseId) },
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
  input: MetricQueryInput,
  databaseId: number,
): MetadataInput {
  const metricId = Number(getMetricIdFromInput(input));
  const sourceId = getMetricSourceIdFromInput(input);

  const sourceTableId = getMetricSourceTableIdFromInput(input);
  const sourceCardId = getMetricSourceCardIdFromInput(input);

  const fields = getMetricDimensionValues(
    input.metric,
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
    input.measures
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
    ...createTableMetadata(table, databaseId, input),
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

const createDatabaseMetadata = (databaseId: number) => ({
  id: databaseId,
  name: `Database ${databaseId}`,
  features: ["basic-aggregations", "binning", "expressions"],
});

const createTableMetadataRecord = (
  table: TableMetadataSource,
  databaseId: number,
) => ({
  id: table.id,
  db_id: databaseId,
  display_name: `Table ${table.id}`,
  name: `table_${table.id}`,
});

const createFieldMetadataRecord = (
  field: FieldSchema,
  tableId: TableId,
  index: number,
) => ({
  id: getFieldId(field) ?? index,
  table_id: tableId,
  name: field.name,
  display_name: field.displayName ?? field.name,
  description: field.description ?? null,
  base_type: getFieldBaseType(field),
  effective_type: getFieldEffectiveType(field),
  position: index,
});

const createSegmentMetadataRecord = (
  segment: SegmentSchema,
  tableId: TableId,
) => ({
  ...segment,
  name: `Segment ${segment.id}`,
  table_id: tableId,
});

const createMeasureMetadataRecord = (
  measure: MeasureReferenceInput,
  tableId: TableId,
) => ({
  ...measure,
  name: `Measure ${measure.id}`,
  table_id: tableId,
});

const createQuestionMetadataRecord = (cardId: number, databaseId: number) => ({
  id: cardId,
  name: `Question ${cardId}`,
  display: "table",
  type: "question",
  dataset_query: {
    type: "query",
    database: databaseId,
    query: { "source-table": getQuestionVirtualTableId(cardId) },
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
        sourceTableId == null
          ? getQuestionVirtualTableId(sourceCardId)
          : sourceTableId,
    },
  },
});

const getTableFields = (
  table: TableMetadataSource,
  query?: QueryMetadataInput,
): FieldSchema[] =>
  getUniqueFields([
    ...Object.values(table.fields ?? {}).filter(hasFieldReferenceId),
    ...getQueryFieldReferences(query),
  ]);

const getTableSegments = (
  table: TableMetadataSource,
  query?: QueryMetadataInput,
): SegmentSchema[] =>
  getUniqueById([
    ...Object.values(table.segments ?? {}),
    ...(query?.filters?.filter(isSegmentSchema) ?? []),
  ]);

const getTableMeasures = (
  table: TableMetadataSource,
  query?: QueryMetadataInput,
): MeasureReferenceInput[] =>
  getUniqueById([
    ...Object.values(table.measures ?? {}),
    ...getQueryAggregations(query).filter(isMeasureSchema),
  ]);

function getQueryFieldReferences(query?: QueryMetadataInput): FieldSchema[] {
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

const getQueryAggregations = (query?: QueryMetadataInput): readonly unknown[] =>
  query == null
    ? []
    : "aggregations" in query
      ? (query.aggregations ?? query.measures ?? [])
      : (query.measures ?? []);

const getUniqueById = <T extends { id: number }>(items: readonly T[]): T[] =>
  Array.from(new Map(items.map((item) => [item.id, item])).values());

const getUniqueFields = (fields: readonly FieldSchema[]): FieldSchema[] =>
  Array.from(
    new Map(fields.map((field) => [getFieldId(field), field])).values(),
  );

const hasFieldReferenceId = (field: FieldSchema): boolean =>
  getFieldId(field) !== null;
