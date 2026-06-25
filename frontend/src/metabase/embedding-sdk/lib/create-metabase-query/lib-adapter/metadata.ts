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
import type { DatasetQuery, TableId } from "metabase-types/api";

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

const STAGE_INDEX = 0;

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

  const metadata: MetadataInput = {
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
  };

  return {
    ...metadata,
    measures: createMeasureMetadataRecords(measures, metadata, databaseId),
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

  const sourceCardQuestion =
    sourceCardId == null
      ? {}
      : {
          [sourceCardId]: createQuestionMetadataRecord(
            Number(sourceCardId),
            databaseId,
          ),
        };

  // `createTableMetadata` already builds the metric's measures (from
  // `input.measures`) against each measure's own table id, so they don't need to
  // be rebuilt here — we only add the source card and the metric card itself.
  const metadata: MetadataInput = {
    ...createTableMetadata(table, databaseId, input),
    questions: sourceCardQuestion,
  };

  return {
    ...metadata,
    questions: {
      ...metadata.questions,
      [metricId]: createMetricCardMetadataRecord(
        {
          metricId,
          databaseId,
          sourceTableId: sourceTableId == null ? null : Number(sourceTableId),
          sourceCardId: sourceCardId == null ? null : Number(sourceCardId),
        },
        buildPlaceholderAggregationQuery(metadata, databaseId, sourceId),
      ),
    },
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

// The generated schema ships a measure's output column, not its aggregation, but
// metabase-lib needs a definition to resolve the aggregation column when ordering
// by the measure. Each record gets a placeholder definition (built from the
// assembled metadata) that only makes the column orderable; the executed query
// references the measure by id, so it never reaches it. The definition depends
// only on the source table, so it's built once per table and shared.
const createMeasureMetadataRecords = (
  measures: readonly MeasureReferenceInput[],
  metadata: MetadataInput,
  databaseId: number,
) => {
  const definitionByTableId = new Map<TableId, DatasetQuery | undefined>();

  const placeholderDefinition = (tableId: TableId) => {
    if (!definitionByTableId.has(tableId)) {
      definitionByTableId.set(
        tableId,
        buildPlaceholderAggregationQuery(metadata, databaseId, tableId),
      );
    }

    return definitionByTableId.get(tableId);
  };

  return Object.fromEntries(
    measures.map((measure) => [
      measure.id,
      {
        ...createMeasureMetadataRecord(measure, measure.tableId),
        definition: placeholderDefinition(measure.tableId),
      },
    ]),
  );
};

const buildPlaceholderAggregationQuery = (
  metadata: MetadataInput,
  databaseId: number,
  sourceId: TableId,
): DatasetQuery | undefined => {
  try {
    return Lib.toJsQuery(
      Lib.aggregateByCount(
        createLibQuery(metadata, databaseId, sourceId),
        STAGE_INDEX,
      ),
    );
  } catch {
    return undefined;
  }
};

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

const createMetricCardMetadataRecord = (
  {
    metricId,
    sourceTableId,
    sourceCardId,
  }: {
    metricId: number;
    databaseId: number;
    sourceTableId: number | null;
    sourceCardId: number | null;
  },
  datasetQuery: DatasetQuery | undefined,
) => ({
  id: metricId,
  name: `Metric ${metricId}`,
  display: "scalar",
  type: "metric",
  table_id: sourceTableId,
  source_card_id: sourceCardId,
  archived: false,
  dataset_query: datasetQuery,
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
