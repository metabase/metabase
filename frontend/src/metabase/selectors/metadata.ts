import _ from "underscore";
import { createSelector } from "@reduxjs/toolkit";

import type {
  Card,
  NormalizedDatabase,
  NormalizedSchema,
  NormalizedTable,
  NormalizedField,
  NormalizedMetric,
  NormalizedSegment,
} from "metabase-types/api";
import type { State } from "metabase-types/store";

import Question from "metabase-lib/Question";
import Metadata from "metabase-lib/metadata/Metadata";
import Database from "metabase-lib/metadata/Database";
import Schema from "metabase-lib/metadata/Schema";
import Table from "metabase-lib/metadata/Table";
import Field from "metabase-lib/metadata/Field";
import Metric from "metabase-lib/metadata/Metric";
import Segment from "metabase-lib/metadata/Segment";
import { isVirtualCardId } from "metabase-lib/metadata/utils/saved-questions";
import {
  getFieldValues,
  getRemappings,
} from "metabase-lib/queries/utils/field";

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
      : filterValues(tables, table => table.visibility_type == null),
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
    filterValues(fields, field => {
      const table = tables[field.table_id];

      const shouldIncludeTable =
        !table || table.visibility_type == null || includeHiddenTables;

      const shouldIncludeField =
        field.visibility_type !== "sensitive" || includeSensitiveFields;

      return shouldIncludeTable && shouldIncludeField;
    }),
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
  ],
  (databases, schemas, tables, fields, segments, metrics, questions) => {
    const metadata = new Metadata();

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
      Object.values(fields).map(f => [f.uniqueId, createField(f, metadata)]),
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

    // table
    hydrateList(metadata.tables, "fields", metadata.fields);
    hydrateList(metadata.tables, "segments", metadata.segments);
    hydrateList(metadata.tables, "metrics", metadata.metrics);
    Object.values(metadata.tables).forEach(table => {
      table.db = hydrateTableDatabase(table, metadata);
    });
    Object.values(metadata.tables).forEach(table => {
      table.schema = hydrateTableSchema(table, metadata);
    });
    Object.values(metadata.databases).forEach(database => {
      database.schemas = hydrateDatabaseSchemas(database, metadata);
    });
    Object.values(metadata.schemas).forEach(schema => {
      schema.tables = hydrateSchemaTables(schema, metadata);
    });

    // segments
    hydrate(
      metadata.segments,
      "table",
      segment => metadata.table(segment.table_id) as Table,
    );
    // metrics
    hydrate(
      metadata.metrics,
      "table",
      metric => metadata.table(metric.table_id) as Table,
    );
    // fields
    hydrate(metadata.fields, "table", field => metadata.table(field.table_id));
    hydrate(metadata.fields, "target", field =>
      metadata.field(field.fk_target_field_id),
    );
    hydrate(metadata.fields, "name_field", field =>
      hydrateNameField(field, metadata),
    );

    hydrate(metadata.fields, "values", field => getFieldValues(field));
    hydrate(
      metadata.fields,
      "remapping",
      field => new Map(getRemappings(field)),
    );

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

function createSchema(schema: NormalizedSchema, metadata: Metadata): Schema {
  const instance = new Schema(schema);
  instance.metadata = metadata;
  return instance;
}

function hydrateSchemaDatabase(
  schema: Schema,
  metadata: Metadata,
): Database | undefined {
  return metadata.database(schema.getPlainObject().database) ?? undefined;
}

function hydrateSchemaTables(schema: Schema, metadata: Metadata): Table[] {
  const tableIds = schema.getPlainObject().tables;
  return tableIds
    ? // use the schema tables if they exist
      tableIds.map(table => metadata.table(table)).filter(isNotNull)
    : schema.database && schema.database.getTables().length > 0
    ? // if the schema has a database with tables, use those
      schema.database
        .getTables()
        .filter(table => table.schema_name === schema.name)
    : // otherwise use any loaded tables that match the schema id
      Object.values(metadata.tables).filter(
        table => table.schema && table.schema.id === schema.id,
      );
}

function createTable(table: NormalizedTable, metadata: Metadata): Table {
  const instance = new Table(table);
  instance.metadata = metadata;
  return instance;
}

function hydrateTableDatabase(
  table: Table,
  metadata: Metadata,
): Database | undefined {
  return metadata.database(table.db_id || table.db) ?? undefined;
}

function hydrateTableSchema(
  table: Table,
  metadata: Metadata,
): Schema | undefined {
  return metadata.schema(table.schema) ?? undefined;
}

function createField(field: NormalizedField, metadata: Metadata) {
  // We need a way to distinguish field objects that come from the server
  // vs. those that are created client-side to handle lossy transformations between
  // Field instances and FieldDimension instances.
  // There are scenarios where we are failing to convert FieldDimensions back into Fields,
  // and as a safeguard we instantiate a new Field that is missing most of its properties.
  const instance = new Field({ ...field, _comesFromEndpoint: true });
  instance.metadata = metadata;
  return instance;
}

function hydrateNameField(field: Field, metadata: Metadata) {
  if (field.name_field != null) {
    return metadata.field(field.name_field);
  } else if (field.table && field.isPK()) {
    return _.find(field.table.getFields(), f => f.isEntityName());
  }
}

function createMetric(metric: NormalizedMetric, metadata: Metadata) {
  const instance = new Metric(metric);
  instance.metadata = metadata;
  return instance;
}

function createSegment(segment: NormalizedSegment, metadata: Metadata) {
  const instance = new Segment(segment);
  instance.metadata = metadata;
  return instance;
}

function createQuestion(card: Card, metadata: Metadata) {
  return new Question(card, metadata);
}

// calls a function to derive the value of a property for every object
function hydrate<MetadataObject>(
  objects: Record<string, MetadataObject>,
  property: keyof MetadataObject,
  getPropertyValue: (object: MetadataObject) => any,
) {
  for (const object of Object.values(objects)) {
    object[property] = getPropertyValue(object);
  }
}

// replaces lists of ids with the actual objects
function hydrateList<MetadataObject, RelatedMetadataObject>(
  objects: Record<string, MetadataObject>,
  property: keyof MetadataObject,
  targetObjects: Record<string, RelatedMetadataObject>,
) {
  hydrate(objects, property, object => {
    const relatedObjectsIdList = (object[property] || []) as string[];
    return relatedObjectsIdList
      .map((id: string) => targetObjects[id])
      .filter(Boolean);
  });
}

function filterValues<T>(obj: Record<string, T>, pred: (obj: T) => boolean) {
  const filtered: Record<string, T> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (pred(v)) {
      filtered[k] = v;
    }
  }
  return filtered;
}
