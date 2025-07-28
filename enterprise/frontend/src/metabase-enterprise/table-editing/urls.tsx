import type { DatabaseId, TableId } from "metabase-types/api";

export function getTableEditUrl(tableId: TableId, databaseId: DatabaseId) {
  return `/browse/databases/${databaseId}/tables/${tableId}/edit`;
}
