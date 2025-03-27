import type { DatabaseId } from "metabase-types/api";

export * as Urls from "metabase/lib/urls";

export function viewDestinationDatabases(databaseId: DatabaseId) {
  return `/admin/databases/${databaseId}/destination-databases`;
}

export function createDestinationDatabase(databaseId: DatabaseId) {
  return `/admin/databases/${databaseId}/destination-databases/create`;
}

export function editDestinationDatabase(
  databaseId: DatabaseId,
  destinationDatabaseId: DatabaseId,
) {
  return `/admin/databases/${databaseId}/destination-databases/${destinationDatabaseId}`;
}

export function removeDestinationDatabase(
  databaseId: DatabaseId,
  destinationDatabaseId: DatabaseId,
) {
  return `/admin/databases/${databaseId}/destination-databases/${destinationDatabaseId}/remove`;
}
