import { type Schema, normalize } from "normalizr";

import type {
  Database,
  Field,
  FieldId,
  FieldValue,
  ForeignKey,
  Table,
  TableId,
} from "metabase-types/api";

import { DatabaseSchema, FieldSchema, TableSchema } from "./schema";

const UPDATE = "metabase/entities/UPDATE";

/**
 * Normalizes an entity, or a list of them, into `state.entities`.
 *
 * Module-private: the barrel does not re-export it. normalizr is how this
 * module stores records, not something its callers should have to know, so the
 * writes below name what they carry and pick their own schema. The hydration
 * listener is the other caller, and it lives in here.
 */
export function updateMetadata(data: unknown, schema: Schema) {
  const payload = normalize(data, schema);
  return { type: UPDATE, payload };
}

/**
 * The fields a card or dashboard names in its parameters, keyed by parameter.
 *
 * Widgets read these to decide whether a parameter gets a value picker or a
 * plain text input, and the endpoints that return them do not hydrate.
 */
export const paramFieldsFetched = (paramFields: Record<string, Field[]>) =>
  updateMetadata(Object.values(paramFields).flat(), [FieldSchema]);

export const databaseFetched = (database: Database) =>
  updateMetadata(database, DatabaseSchema);

export const tableFetched = (table: Table) =>
  updateMetadata(table, TableSchema);

export const fieldFetched = (field: Field) =>
  updateMetadata(field, FieldSchema);

/**
 * `listTableForeignKeys` returns the keys alone, so they are attached to the
 * table the caller asked about.
 */
export const tableForeignKeysFetched = (id: TableId, fks: ForeignKey[]) =>
  updateMetadata({ id, fks }, TableSchema);

/**
 * A field's remappings accumulate on the client. No endpoint returns them, and
 * one component's fetch labels values for another.
 */
export const fieldRemappingsUpdated = (id: FieldId, remappings: FieldValue[]) =>
  updateMetadata({ id, remappings }, FieldSchema);
