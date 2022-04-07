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

type TableWithDatabaseAndSchemaInfo = Table & {
  db: Database;
  schema_name: string;
};

export function browseSchema(table: TableWithDatabaseAndSchemaInfo) {
  return `/browse/${table.db.id}/schema/${table.schema_name}`;
}

export function browseTable(table: TableWithDatabaseAndSchemaInfo) {
  return `/browse/${table.db.id}/schema/${table.schema_name}`;
}
