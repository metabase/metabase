// normalizr schema for use in actions/reducers

import { schema } from "normalizr";
import { generateSchemaId, entityTypeForObject } from "metabase/lib/schema";
import { SAVED_QUESTIONS_VIRTUAL_DB_ID } from "metabase/lib/saved-questions";

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
      // Saved questions are represented as database tables,
      // and collections they're saved to as schemas
      // Virtual tables ID are strings like "card__45" (where 45 is a question ID)
      const isVirtualSchema = typeof table.id === "string";

      const databaseId = isVirtualSchema
        ? SAVED_QUESTIONS_VIRTUAL_DB_ID
        : table.db_id;
      if (typeof table.schema === "string" || table.schema === null) {
        table.schema_name = table.schema;
        table.schema = {
          id: generateSchemaId(databaseId, table.schema_name),
          name: table.schema_name,
          database: {
            id: databaseId,
            is_saved_questions: isVirtualSchema,
          },
        };
      }
      return table;
    },
  },
);
export const FieldSchema = new schema.Entity("fields");
export const SegmentSchema = new schema.Entity("segments");
export const MetricSchema = new schema.Entity("metrics");
export const SnippetSchema = new schema.Entity("snippets");
export const SnippetCollectionSchema = new schema.Entity("snippetCollections");

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

export const ENTITIES_SCHEMA_MAP = {
  questions: QuestionSchema,
  dashboards: DashboardSchema,
  pulses: PulseSchema,
  collections: CollectionSchema,
  segments: SegmentSchema,
  metrics: MetricSchema,
  snippets: SnippetSchema,
  snippetCollections: SnippetCollectionSchema,
};

export const ObjectUnionSchema = new schema.Union(
  ENTITIES_SCHEMA_MAP,
  (object, parent, key) => entityTypeForObject(object),
);

CollectionSchema.define({
  items: [ObjectUnionSchema],
});

export const RecentsSchema = new schema.Entity("recents", undefined, {
  idAttribute: ({ model, model_id }) => `${model}:${model_id}`,
});

export const LoginHistorySchema = new schema.Entity("loginHistory", undefined, {
  idAttribute: ({ timestamp }) => `${timestamp}`,
});
