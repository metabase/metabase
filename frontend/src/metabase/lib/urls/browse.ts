import slugg from "slugg";

import type DatabaseV1 from "metabase-lib/v1/metadata/Database";
import type Table from "metabase-lib/v1/metadata/Table";
import { SAVED_QUESTIONS_VIRTUAL_DB_ID } from "metabase-lib/v1/metadata/utils/saved-questions";
import type { Database } from "metabase-types/api";

import { appendSlug } from "./utils";

export function browseDatabase(database: DatabaseV1 | Database) {
  const name =
    database.id === SAVED_QUESTIONS_VIRTUAL_DB_ID
      ? "Saved Questions"
      : database.name;

  return appendSlug(`/browse/databases/${database.id}`, slugg(name));
}

export function browseSchema(table: {
  db_id?: Table["db_id"];
  schema_name: Table["schema_name"] | null;
  db?: Pick<DatabaseV1, "id">;
}) {
  const databaseId = table.db?.id || table.db_id;
  return `/browse/databases/${databaseId}/schema/${encodeURIComponent(
    table.schema_name ?? "",
  )}`;
}

export function browseTable(table: Table) {
  const databaseId = table.db?.id || table.db_id;
  return `/browse/databases/${databaseId}/schema/${table.schema_name}`;
}
