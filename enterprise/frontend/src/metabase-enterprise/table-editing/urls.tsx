import type { DatabaseId, TableId } from "metabase-types/api";

export function getTableViewUrl(tableId: TableId, databaseId: DatabaseId) {
  return `/browse/databases/${databaseId}/tables/${tableId}`;
}

export function getTableEditUrl(tableId: TableId, databaseId: DatabaseId) {
  return `/browse/databases/${databaseId}/tables/${tableId}/edit`;
}
