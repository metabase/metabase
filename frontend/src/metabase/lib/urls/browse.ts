import slugg from "slugg";

import { SAVED_QUESTIONS_VIRTUAL_DB_ID } from "metabase/lib/saved-questions";
import { Database, Table } from "metabase-types/api";

import { appendSlug } from "./utils";

export function browseDatabase(database: Database) {
  const name =
    database.id === SAVED_QUESTIONS_VIRTUAL_DB_ID
      ? "Saved Questions"
      : database.name;

  return appendSlug(`/browse/${database.id}`, slugg(name));
}

export function browseSchema(table: Table) {
  const databaseId = table.db?.id || table.db_id;
  return `/browse/${databaseId}/schema/${encodeURIComponent(
    table.schema_name ?? "",
  )}`;
}

export function browseTable(table: Table) {
  const databaseId = table.db?.id || table.db_id;
  return `/browse/${databaseId}/schema/${table.schema_name}`;
}
