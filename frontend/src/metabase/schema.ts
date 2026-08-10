// normalizr schema for use in actions/reducers

import { schema } from "normalizr";

import { entityTypeForObject } from "metabase/redux/store/entities";
import { getUniqueFieldId } from "metabase-lib/v1/metadata/utils/fields";
import { SAVED_QUESTIONS_VIRTUAL_DB_ID } from "metabase-lib/v1/metadata/utils/saved-questions";
import { generateSchemaId } from "metabase-lib/v1/metadata/utils/schema";
import type {
  CacheConfig,
  Card,
  Collection,
  Dashboard,
  Database,
  DatabaseId,
  Field,
  ForeignKey,
  Measure,
  Metric,
  NativeQuerySnippet,
  Schema,
  SchemaId,
  SchemaName,
  Segment,
  Table,
} from "metabase-types/api";

export const QuestionSchema = new schema.Entity<Card>("questions");
export const CacheConfigSchema = new schema.Entity<CacheConfig>("cacheConfigs");
export const DashboardSchema = new schema.Entity<Dashboard>("dashboards");
export const CollectionSchema = new schema.Entity<Collection>("collections");

export const DatabaseSchema = new schema.Entity<Database>("databases");
export const SchemaSchema = new schema.Entity<Schema>("schemas");

type TableEntitySchema = {
  id: SchemaId;
  name: SchemaName | null;
  database: Pick<Database, "id" | "is_saved_questions">;
};

// also accepts partial payloads (e.g. `{ id, fks }` from loadTableFks) and
// tables whose `schema` was already converted to an object
type TableEntityData = Partial<Omit<Table, "schema">> &
  Pick<Table, "id"> & {
    schema?: SchemaName | TableEntitySchema | null;
    schema_name?: SchemaName | null;
    original_fields?: Field[];
  };

export const TableSchema = new schema.Entity(
  "tables",
  {},
  {
    // convert "schema" returned by API as a string value to an object that can be normalized
    processStrategy({ ...table }: TableEntityData) {
      // Saved questions are represented as database tables,
      // and collections they're saved to as schemas
      // Virtual tables ID are strings like "card__45" (where 45 is a question ID)
      const isVirtualSchema = typeof table.id === "string";

      const databaseId = isVirtualSchema
        ? SAVED_QUESTIONS_VIRTUAL_DB_ID
        : // a table carrying a raw string `schema` always carries `db_id`; partial
          // payloads without it (e.g. `{ id, fks }`) skip the schema branch below
          (table.db_id as DatabaseId);
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

      if (table.fields != null && table.original_fields == null) {
        table.original_fields = table.fields;
      }

      return table;
    },
  },
);

type FieldEntityData = Partial<Field> & Pick<Field, "id">;

export type FieldEntity = FieldEntityData & { uniqueId: number | string };

export const FieldSchema = new schema.Entity("fields", undefined, {
  processStrategy(field: FieldEntityData): FieldEntity {
    const uniqueId = getUniqueFieldId(field);
    return {
      ...field,
      uniqueId,
    };
  },
  idAttribute: (field: FieldEntityData) => {
    // getUniqueFieldId can return a number, which normalizr accepts at runtime
    // (ids end up as object keys), but its SchemaFunction type is string-only
    return getUniqueFieldId(field) as string;
  },
});

export const ForeignKeySchema = new schema.Entity<ForeignKey>("foreignKeys");
export const SegmentSchema = new schema.Entity<Segment>("segments");
export const MeasureSchema = new schema.Entity<Measure>("measures");
export const MetricSchema = new schema.Entity<Metric>("metrics");
export const SnippetSchema = new schema.Entity<NativeQuerySnippet>("snippets");
export const SnippetCollectionSchema = new schema.Entity<Collection>(
  "snippetCollections",
);

DatabaseSchema.define({
  tables: [TableSchema],
  schemas: [SchemaSchema],
  idFields: [FieldSchema],
});

SchemaSchema.define({
  database: DatabaseSchema,
  tables: [TableSchema],
});

TableSchema.define({
  db: DatabaseSchema,
  fields: [FieldSchema],
  fks: [{ origin: FieldSchema, destination: FieldSchema }],
  metrics: [QuestionSchema],
  segments: [SegmentSchema],
  measures: [MeasureSchema],
  schema: SchemaSchema,
  collection: CollectionSchema,
});

FieldSchema.define({
  target: FieldSchema,
  table: TableSchema,
  name_field: FieldSchema,
  dimensions: [{ human_readable_field: FieldSchema }],
});

ForeignKeySchema.define({
  origin: FieldSchema,
  destination: FieldSchema,
});

SegmentSchema.define({
  table: TableSchema,
});

MeasureSchema.define({
  table: TableSchema,
});

CacheConfigSchema.define({});

export const ENTITIES_SCHEMA_MAP = {
  questions: QuestionSchema,
  cacheConfigs: CacheConfigSchema,
  dashboards: DashboardSchema,
  collections: CollectionSchema,
  segments: SegmentSchema,
  measures: MeasureSchema,
  metrics: MetricSchema,
  snippets: SnippetSchema,
  snippetCollections: SnippetCollectionSchema,
};

export const ObjectUnionSchema = new schema.Union(
  ENTITIES_SCHEMA_MAP,
  // entityTypeForObject returns undefined for unknown models, which normalizr
  // tolerates at runtime (the value is left unnormalized), but its declared
  // SchemaFunction type does not
  (object: { model: string }) => entityTypeForObject(object) as string,
);

CollectionSchema.define({
  items: [ObjectUnionSchema],
});

export const QueryMetadataSchema = {
  databases: [DatabaseSchema],
  tables: [TableSchema],
  fields: [FieldSchema],
  snippets: [SnippetSchema],
  cards: [QuestionSchema],
  dashboards: [DashboardSchema],
};
