import slugg from "slugg";

import type { Database, DatabaseId, SchemaName } from "metabase-types/api";

import { appendSlug } from "./utils";

export function databaseSlug(
  database: Pick<Database, "id"> & Partial<Pick<Database, "name">>,
) {
  return appendSlug(database.id, slugg(database.name ?? ""));
}

export function browseDatabase(
  database: Pick<Database, "id"> & Partial<Pick<Database, "name">>,
) {
  return `/browse/databases/${databaseSlug(database)}`;
}

export function browseSchema(table: {
  db_id?: DatabaseId;
  schema_name?: SchemaName | null;
  db?: Pick<Database, "id">;
}) {
  const databaseId = table.db?.id || table.db_id;
  return `/browse/databases/${databaseId}/schema/${encodeURIComponent(
    table.schema_name ?? "",
  )}`;
}

export function browseSchemaBySlug(databaseSlug: string, schemaName: string) {
  return `/browse/databases/${encodeURIComponent(databaseSlug)}/schema/${encodeURIComponent(schemaName)}`;
}

type DatabaseRef = Pick<Database, "id" | "name">;

// A name that starts with a digit is parsed as an id by the router, so fall back
// to the id for those databases; otherwise use the raw (encoded) name.
const databaseSegment = (database: DatabaseRef) =>
  /^\d/.test(database.name)
    ? `${database.id}`
    : encodeURIComponent(database.name);

export function permalinkDatabase(database: DatabaseRef) {
  return `/browse/databases/${databaseSegment(database)}`;
}
