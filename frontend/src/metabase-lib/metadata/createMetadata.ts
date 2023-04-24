import _ from "underscore";

import type {
  Card,
  Database as IDatabase,
  Schema as ISchema,
  Table as ITable,
  Field as IField,
  Metric as IMetric,
  Segment as ISegment,
} from "metabase-types/api";

import Question from "../Question";
import { getFieldValues, getRemappings } from "../queries/utils/field";
import { isVirtualCardId } from "./utils/saved-questions";

import Metadata from "./Metadata";
import Database from "./Database";
import Schema from "./Schema";
import Table from "./Table";
import Field from "./Field";
import Metric from "./Metric";
import Segment from "./Segment";

type MetadataFactoryOpts = {
  databases: Record<string, IDatabase>;
  schemas: Record<string, ISchema>;
  tables: Record<string, ITable>;
  fields: Record<string, IField>;
  metrics: Record<string, IMetric>;
  segments: Record<string, ISegment>;
  questions: Record<string, Card>;
};

function createMetadata({
  databases,
  schemas,
  tables,
  fields,
  metrics,
  segments,
  questions,
}: MetadataFactoryOpts): Metadata {
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
  hydrate(
    metadata.schemas,
    "database",
    schema => metadata.database(schema.database) as Database,
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

  hydrate(metadata.schemas, "tables", schema =>
    schema.tables
      ? // use the schema tables if they exist
        schema.tables.map(table => metadata.table(table))
      : schema.database && schema.database.tables.length > 0
      ? // if the schema has a database with tables, use those
        schema.database.tables.filter(
          table => table.schema_name === schema.name,
        )
      : // otherwise use any loaded tables that match the schema id
        Object.values(metadata.tables).filter(
          table => table.schema && table.schema.id === schema.id,
        ),
  );

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
  hydrate(metadata.fields, "remapping", field => new Map(getRemappings(field)));

  return metadata;
}

function createDatabase(db: IDatabase, metadata: Metadata) {
  const instance = new Database(db);
  instance.metadata = metadata;
  return instance;
}

function createSchema(schema: ISchema, metadata: Metadata) {
  const instance = new Schema(schema);
  instance.metadata = metadata;
  return instance;
}

function createTable(table: ITable, metadata: Metadata) {
  const instance = new Table(table);
  instance.metadata = metadata;
  return instance;
}

function createField(field: IField, metadata: Metadata) {
  // We need a way to distinguish field objects that come from the server
  // vs. those that are created client-side to handle lossy transformations between
  // Field instances and FieldDimension instances.
  // There are scenarios where we are failing to convert FieldDimensions back into Fields,
  // and as a safeguard we instantiate a new Field that is missing most of its properties.
  const instance = new Field({ ...field, _comesFromEndpoint: true });
  instance.metadata = metadata;
  return instance;
}

function createMetric(metric: IMetric, metadata: Metadata) {
  const instance = new Metric(metric);
  instance.metadata = metadata;
  return instance;
}

function createSegment(segment: ISegment, metadata: Metadata) {
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

export default createMetadata;
