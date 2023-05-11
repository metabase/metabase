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

    metadata.databases = copyObjects(metadata, databases, createDatabase);
    metadata.schemas = copyObjects(metadata, schemas, createSchema);
    metadata.tables = copyObjects(metadata, tables, createTable);
    metadata.fields = copyObjects(metadata, fields, createField, "uniqueId");
    metadata.segments = copyObjects(metadata, segments, createSegment);
    metadata.metrics = copyObjects(metadata, metrics, createMetric);
    metadata.questions = copyObjects(metadata, questions, createQuestion);

    // database
    hydrate(metadata.databases, "tables", database => {
      if (database.tables?.length > 0) {
        return database.tables
          .map(tableId => metadata.table(tableId))
          .filter(table => table != null);
      }

      return Object.values(metadata.tables).filter(
        table =>
          !isVirtualCardId(table.id) &&
          table.schema &&
          table.db_id === database.id,
      );
    });
    // schema
    hydrate(metadata.schemas, "database", schema =>
      metadata.database(schema.getPlainObject().database),
    );

    // table
    hydrateList(metadata.tables, "fields", metadata.fields);
    hydrateList(metadata.tables, "segments", metadata.segments);
    hydrateList(metadata.tables, "metrics", metadata.metrics);
    hydrate(metadata.tables, "db", table =>
      metadata.database(table.db_id || table.db),
    );
    hydrate(metadata.tables, "schema", table => metadata.schema(table.schema));

    hydrate(metadata.databases, "schemas", database => {
      if (database.schemas) {
        return database.schemas.map(s => metadata.schema(s));
      }
      return Object.values(metadata.schemas).filter(
        s => s.database && s.database.id === database.id,
      );
    });

    hydrate(metadata.schemas, "tables", schema => {
      const tableIds = schema.getPlainObject().tables;
      return tableIds
        ? // use the schema tables if they exist
          tableIds.map(table => metadata.table(table))
        : schema.database && schema.database.tables.length > 0
        ? // if the schema has a database with tables, use those
          schema.database.tables.filter(
            table => table.schema_name === schema.name,
          )
        : // otherwise use any loaded tables that match the schema id
          Object.values(metadata.tables).filter(
            table => table.schema && table.schema.id === schema.id,
          );
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
    hydrate(metadata.fields, "name_field", field => {
      if (field.name_field != null) {
        return metadata.field(field.name_field);
      } else if (field.table && field.isPK()) {
        return _.find(field.table.fields, f => f.isEntityName());
      }
    });

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

function createDatabase(db: NormalizedDatabase, metadata: Metadata) {
  const instance = new Database(db);
  instance.metadata = metadata;
  return instance;
}

function createSchema(schema: NormalizedSchema, metadata: Metadata) {
  const instance = new Schema(schema);
  instance.metadata = metadata;
  return instance;
}

function createTable(table: NormalizedTable, metadata: Metadata) {
  const instance = new Table(table);
  instance.metadata = metadata;
  return instance;
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

function copyObjects<RawObject, MetadataObject>(
  metadata: Metadata,
  objects: Record<string, RawObject>,
  instantiate: (object: RawObject, metadata: Metadata) => MetadataObject,
  identifierProp = "id",
) {
  const copies: Record<string, MetadataObject> = {};
  for (const object of Object.values(objects)) {
    const objectId = object?.[identifierProp as keyof RawObject];
    if (objectId != null) {
      copies[objectId as unknown as string] = instantiate(object, metadata);
    } else {
      console.warn(`Missing ${identifierProp}:`, object);
    }
  }
  return copies;
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
