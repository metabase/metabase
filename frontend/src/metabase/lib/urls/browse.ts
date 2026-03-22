import slugg from "slugg";

import { SAVED_QUESTIONS_VIRTUAL_DB_ID } from "metabase/lib/saved-questions";
import type { DatabaseId } from "metabase-types/api";

import { appendSlug } from "./utils";

interface BrowseTable {
  db_id?: DatabaseId;
  schema_name?: string | null;
  db?: { id: DatabaseId };
}

export function browseDatabase(database: {
  id: DatabaseId;
  name?: string | null;
}) {
  const name =
    database.id === SAVED_QUESTIONS_VIRTUAL_DB_ID
      ? "Saved Questions"
      : database.name;

  return appendSlug(`/browse/databases/${database.id}`, slugg(name ?? ""));
}

export function browseSchema(table: BrowseTable) {
  const databaseId = table.db?.id || table.db_id;
  return `/browse/databases/${databaseId}/schema/${encodeURIComponent(
    table.schema_name ?? "",
  )}`;
}
