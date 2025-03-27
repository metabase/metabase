import type { TableId } from "metabase-types/api";

export function tableView(databaseId: number, tableId: TableId) {
  return `/browse/databases/${databaseId}/tables/${tableId}`;
}
