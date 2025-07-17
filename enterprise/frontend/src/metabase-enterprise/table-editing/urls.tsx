import type TableV1 from "metabase-lib/v1/metadata/Table";
import type { Table } from "metabase-types/api";

export function getTableViewUrl(table: Table | TableV1) {
  const databaseId = table.db?.id || table.db_id;
  return `/browse/databases/${databaseId}/tables/${table.id}`;
}

export function getTableEditUrl(table: Table | TableV1) {
  const databaseId = table.db?.id || table.db_id;
  return `/browse/databases/${databaseId}/tables/${table.id}/edit`;
}
