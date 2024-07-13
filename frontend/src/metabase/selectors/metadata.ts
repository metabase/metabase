import { createSelector } from "@reduxjs/toolkit";
import { normalize } from "normalizr";

import { FieldSchema } from "metabase/schema";
import Question from "metabase-lib/v1/Question";
import Database from "metabase-lib/v1/metadata/Database";
import Field from "metabase-lib/v1/metadata/Field";
import ForeignKey from "metabase-lib/v1/metadata/ForeignKey";
import Metadata from "metabase-lib/v1/metadata/Metadata";
import Metric from "metabase-lib/v1/metadata/Metric";
import Schema from "metabase-lib/v1/metadata/Schema";
import Segment from "metabase-lib/v1/metadata/Segment";
import Table from "metabase-lib/v1/metadata/Table";
import { isVirtualCardId } from "metabase-lib/v1/metadata/utils/saved-questions";
import {
  getFieldValues,
  getRemappings,
} from "metabase-lib/v1/queries/utils/field";
import type {
  Card,
  NormalizedDatabase,
  NormalizedField,
  NormalizedForeignKey,
  NormalizedMetric,
  NormalizedSchema,
  NormalizedSegment,
  NormalizedTable,
} from "metabase-types/api";
import type { State } from "metabase-types/store";

import { getSettings } from "./settings";

type TableSelectorOpts = {
  includeHiddenTables?: boolean;
};

type FieldSelectorOpts = {
  includeSensitiveFields?: boolean;
};

export type MetadataSelectorOpts = TableSelectorOpts & FieldSelectorOpts;

const getNormalizedDatabases = (state: State) => state.entities.databases;
const getNormalizedSchemas = (state: State) => state.entities.schemas;

const getNormalizedTablesUnfiltered = (state: State) => state.entities.tables;

const getIncludeHiddenTables = (_state: State, props?: TableSelectorOpts) =>
  !!props?.includeHiddenTables;

const getNormalizedTables = createSelector(
  [getNormalizedTablesUnfiltered, getIncludeHiddenTables],
  (tables, includeHiddenTables) =>
    includeHiddenTables
      ? tables
      : Object.fromEntries(
          Object.entries(tables).filter(
            ([, table]) => table.visibility_type == null,
          ),
        ),
);

const getNormalizedFieldsUnfiltered = (state: State) => state.entities.fields;
const getIncludeSensitiveFields = (_state: State, props?: FieldSelectorOpts) =>
  !!props?.includeSensitiveFields;

const getNormalizedFields = createSelector(
  [
    getNormalizedFieldsUnfiltered,
    getNormalizedTablesUnfiltered,
    getIncludeHiddenTables,
    getIncludeSensitiveFields,
  ],
  (fields, tables, includeHiddenTables, includeSensitiveFields) =>
    Object.fromEntries(
      Object.entries(fields).filter(([, field]) => {
        const table = tables[field.table_id];

        const shouldIncludeTable =
          !table || table.visibility_type == null || includeHiddenTables;

        const shouldIncludeField =
          field.visibility_type !== "sensitive" || includeSensitiveFields;

        return shouldIncludeTable && shouldIncludeField;
      }),
    ),
);

const getNormalizedMetrics = (state: State) => state.entities.metrics;
const getNormalizedSegments = (state: State) => state.entities.segments;
const getNormalizedQuestions = (state: State) => state.entities.questions;

export const getShallowDatabases = getNormalizedDatabases;
export const getShallowTables = getNormalizedTables;
export const getShallowFields = getNormalizedFields;
export const getShallowMetrics = getNormalizedMetrics;
export const getShallowSegments = getNormalizedSegments;

export const getMetadata: (
  state: State,
  props?: MetadataSelectorOpts,
) => Metadata = createSelector(
  [
    getNormalizedDatabases,
    getNormalizedSchemas,
    getNormalizedTables,
    getNormalizedFields,
    getNormalizedSegments,
    getNormalizedMetrics,
    getNormalizedQuestions,
    getSettings,
  ],
  (
    databases,
    schemas,
    tables,
    fields,
    segments,
    metrics,
    questions,
    settings,
  ) => {
    const metadata = new Metadata({ settings });

    metadata.databases = Object.fromEntries(
      Object.values(databases).map(d => [d.id, createDatabase(d, metadata)]),
    );
    metadata.schemas = Object.fromEntries(
      Object.values(schemas).map(s => [s.id, createSchema(s, metadata)]),
    );
    metadata.tables = Object.fromEntries(
      Object.values(tables).map(t => [t.id, createTable(t, metadata)]),
    );
    metadata.fields = Object.fromEntries(
      Object.values(fields)
        .filter(f => f.uniqueId != null) // remove stub field instances created for field values without field properties
        .map(f => [f.uniqueId, createField(f, metadata)]),
    );
    metadata.segments = Object.fromEntries(
      Object.values(segments).map(s => [s.id, createSegment(s, metadata)]),
    );
    metadata.metrics = Object.fromEntries(
      Object.values(metrics).map(m => [m.id, createMetric(m, metadata)]),
    );
    metadata.questions = Object.fromEntries(
      Object.values(questions).map(c => [c.id, createQuestion(c, metadata)]),
    );

    Object.values(metadata.databases).forEach(database => {
      database.tables = hydrateDatabaseTables(database, metadata);
    });
    Object.values(metadata.schemas).forEach(schema => {
      schema.database = hydrateSchemaDatabase(schema, metadata);
    });
    Object.values(metadata.tables).forEach(table => {
      table.db = hydrateTableDatabase(table, metadata);
      table.schema = hydrateTableSchema(table, metadata);
      table.fields = hydrateTableFields(table, metadata);
      table.fks = hydrateTableForeignKeys(table, metadata);
      table.segments = hydrateTableSegments(table, metadata);
      table.metrics = hydrateTableMetrics(table, metadata);
    });
    Object.values(metadata.databases).forEach(database => {
      database.schemas = hydrateDatabaseSchemas(database, metadata);
    });
    Object.values(metadata.schemas).forEach(schema => {
      schema.tables = hydrateSchemaTables(schema, metadata);
    });
    Object.values(metadata.segments).forEach(segment => {
      segment.table = hydrateSegmentTable(segment, metadata);
    });
    Object.values(metadata.metrics).forEach(metric => {
      metric.table = hydrateMetricTable(metric, metadata);
    });
    Object.values(metadata.fields).forEach(field => {
      hydrateField(field, metadata);
    });
    Object.values(metadata.tables).forEach(table => {
      table.fields?.forEach(field => hydrateField(field, metadata));
    });

    return metadata;
  },
);

export const getMetadataUnfiltered = (state: State) => {
  return getMetadata(state, {
    includeHiddenTables: true,
    includeSensitiveFields: true,
  });
};

export const getMetadataWithHiddenTables = (
  state: State,
  props?: TableSelectorOpts,
) => {
  return getMetadata(state, { ...props, includeHiddenTables: true });
};

// Utils

function isNotNull<T>(value: T | null | undefined): value is T {
  return value != null;
}

function createDatabase(
  database: NormalizedDatabase,
  metadata: Metadata,
): Database {
  const instance = new Database(database);
  instance.metadata = metadata;
  return instance;
}

function createSchema(schema: NormalizedSchema, metadata: Metadata): Schema {
  const instance = new Schema(schema);
  instance.metadata = metadata;
  return instance;
}

function createTable(table: NormalizedTable, metadata: Metadata): Table {
  const instance = new Table(table);
  instance.metadata = metadata;
  return instance;
}

function createField(field: NormalizedField, metadata: Metadata): Field {
  // We need a way to distinguish field objects that come from the server
  // vs. those that are created client-side to handle lossy transformations between
  // Field instances and FieldDimension instances.
  // There are scenarios where we are failing to convert FieldDimensions back into Fields,
  // and as a safeguard we instantiate a new Field that is missing most of its properties.
  const instance = new Field({ ...field, _comesFromEndpoint: true });
  instance.metadata = metadata;
  return instance;
}

function createForeignKey(
  foreignKey: NormalizedForeignKey,
  metadata: Metadata,
): ForeignKey {
  const instance = new ForeignKey(foreignKey);
  instance.metadata = metadata;
  return instance;
}

function createMetric(metric: NormalizedMetric, metadata: Metadata): Metric {
  const instance = new Metric(metric);
  instance.metadata = metadata;
  return instance;
}

function createSegment(
  segment: NormalizedSegment,
  metadata: Metadata,
): Segment {
  const instance = new Segment(segment);
  instance.metadata = metadata;
  return instance;
}

function createQuestion(card: Card, metadata: Metadata): Question {
  return new Question(card, metadata);
}

function hydrateDatabaseTables(
  database: Database,
  metadata: Metadata,
): Table[] {
  const tableIds = database.getPlainObject().tables ?? [];
  if (tableIds.length > 0) {
    return tableIds.map(tableId => metadata.table(tableId)).filter(isNotNull);
  }

  return Object.values(metadata.tables).filter(
    table =>
      !isVirtualCardId(table.id) && table.schema && table.db_id === database.id,
  );
}

function hydrateDatabaseSchemas(
  database: Database,
  metadata: Metadata,
): Schema[] {
  const schemaIds = database.getPlainObject().schemas;
  if (schemaIds) {
    return schemaIds.map(s => metadata.schema(s)).filter(isNotNull);
  }

  return Object.values(metadata.schemas).filter(
    s => s.database && s.database.id === database.id,
  );
}

function hydrateSchemaDatabase(
  schema: Schema,
  metadata: Metadata,
): Database | undefined {
  const databaseId = schema.getPlainObject().database;
  return metadata.database(databaseId) ?? undefined;
}

function hydrateSchemaTables(schema: Schema, metadata: Metadata): Table[] {
  const tableIds = schema.getPlainObject().tables;
  if (tableIds) {
    return tableIds.map(table => metadata.table(table)).filter(isNotNull);
  } else if (schema.database && schema.database.getTables().length > 0) {
    return schema.database
      .getTables()
      .filter(table => table.schema_name === schema.name);
  } else {
    return Object.values(metadata.tables).filter(
      table => table.schema && table.schema.id === schema.id,
    );
  }
}

function hydrateTableDatabase(
  table: Table,
  metadata: Metadata,
): Database | undefined {
  const { db, db_id } = table.getPlainObject();
  return metadata.database(db ?? db_id) ?? undefined;
}

function hydrateTableSchema(
  table: Table,
  metadata: Metadata,
): Schema | undefined {
  const schemaId = table.getPlainObject().schema;
  return metadata.schema(schemaId) ?? undefined;
}

function hydrateTableFields(entityTable: Table, metadata: Metadata): Field[] {
  const apiTable = entityTable.getPlainObject();

  if (!apiTable.original_fields) {
    const fieldIds = apiTable.fields ?? [];
    return fieldIds.map(id => metadata.field(id)).filter(isNotNull);
  }

  return apiTable.original_fields.map(apiField => {
    const { entities, result } = normalize(apiField, FieldSchema);
    const normalizedField = entities.fields?.[result];
    return createField(normalizedField, metadata);
  });
}

function hydrateField(field: Field, metadata: Metadata) {
  field.table = hydrateFieldTable(field, metadata);
  field.target = hydrateFieldTarget(field, metadata);
  field.name_field = hydrateNameField(field, metadata);
  field.values = getFieldValues(field);
  field.remapping = new Map(getRemappings(field));
}

function hydrateTableForeignKeys(
  table: Table,
  metadata: Metadata,
): ForeignKey[] | undefined {
  return table.getPlainObject().fks?.map(fk => {
    const instance = createForeignKey(fk, metadata);
    instance.origin = metadata.field(fk.origin_id) ?? undefined;
    instance.destination = metadata.field(fk.destination_id) ?? undefined;
    return instance;
  });
}

function hydrateTableSegments(table: Table, metadata: Metadata): Segment[] {
  const segmentIds = table.getPlainObject().segments ?? [];
  return segmentIds.map(id => metadata.segment(id)).filter(isNotNull);
}

function hydrateTableMetrics(table: Table, metadata: Metadata): Metric[] {
  const metricIds = table.getPlainObject().metrics ?? [];
  return metricIds.map(id => metadata.metric(id)).filter(isNotNull);
}

function hydrateFieldTable(
  field: Field,
  metadata: Metadata,
): Table | undefined {
  return metadata.table(field.table_id) ?? undefined;
}

function hydrateFieldTarget(
  field: Field,
  metadata: Metadata,
): Field | undefined {
  return metadata.field(field.fk_target_field_id) ?? undefined;
}

function hydrateNameField(field: Field, metadata: Metadata): Field | undefined {
  const nameFieldId = field.getPlainObject().name_field;
  if (nameFieldId != null) {
    return metadata.field(nameFieldId) ?? undefined;
  }
}

function hydrateSegmentTable(
  segment: Segment,
  metadata: Metadata,
): Table | undefined {
  return metadata.table(segment.table_id) ?? undefined;
}

function hydrateMetricTable(
  metric: Metric,
  metadata: Metadata,
): Table | undefined {
  return metadata.table(metric.table_id) ?? undefined;
}
