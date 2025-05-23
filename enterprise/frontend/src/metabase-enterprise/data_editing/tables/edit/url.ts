export function getTableEditPathname(
  databaseId: number,
  tableId: number,
  objectId?: string,
): string {
  return `/browse/databases/${databaseId}/tables/${tableId}/edit${
    objectId ? `/${objectId}` : ""
  }`;
}
