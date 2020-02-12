// normalizr schema for use in actions/reducers

import { schema } from "normalizr";

export const QuestionSchema = new schema.Entity("questions");
export const DashboardSchema = new schema.Entity("dashboards");
export const PulseSchema = new schema.Entity("pulses");
export const CollectionSchema = new schema.Entity("collections");

export const DatabaseSchema = new schema.Entity("databases");
export const SchemaSchema = new schema.Entity("schemas");
export const TableSchema = new schema.Entity(
  "tables",
  {},
  {
    // convert "schema" returned by API as a string value to an object that can be normalized
    processStrategy({ ...table }) {
      // special case for "Saved Question" tables
      const databaseId = typeof table.id === "string" ? -1337 : table.db_id;
      if (typeof table.schema === "string" || table.schema === null) {
        table.schema_name = table.schema;
        table.schema = {
          id: generateSchemaId(databaseId, table.schema_name),
          name: table.schema_name,
          database: { id: databaseId },
        };
      }
      return table;
    },
  },
);
export const FieldSchema = new schema.Entity("fields");
export const SegmentSchema = new schema.Entity("segments");
export const MetricSchema = new schema.Entity("metrics");

DatabaseSchema.define({
  tables: [TableSchema],
  schemas: [SchemaSchema],
});

SchemaSchema.define({
  database: DatabaseSchema,
  tables: [TableSchema],
});

TableSchema.define({
  db: DatabaseSchema,
  fields: [FieldSchema],
  segments: [SegmentSchema],
  metrics: [MetricSchema],
  schema: SchemaSchema,
});

FieldSchema.define({
  target: FieldSchema,
  table: TableSchema,
  name_field: FieldSchema,
  dimensions: {
    human_readable_field: FieldSchema,
  },
});

SegmentSchema.define({
  table: TableSchema,
});

MetricSchema.define({
  table: TableSchema,
});

// backend returns model = "card" instead of "question"
export const entityTypeForModel = model =>
  model === "card" ? "questions" : `${model}s`;

export const entityTypeForObject = object =>
  object && entityTypeForModel(object.model);

export const ENTITIES_SCHEMA_MAP = {
  questions: QuestionSchema,
  dashboards: DashboardSchema,
  pulses: PulseSchema,
  collections: CollectionSchema,
  segments: SegmentSchema,
  metrics: MetricSchema,
};

export const ObjectUnionSchema = new schema.Union(
  ENTITIES_SCHEMA_MAP,
  (object, parent, key) => entityTypeForObject(object),
);

CollectionSchema.define({
  items: [ObjectUnionSchema],
});

export const parseSchemaId = id => String(id || "").split(":");
export const generateSchemaId = (dbId, schemaName) =>
  `${dbId}:${schemaName || ""}`;
