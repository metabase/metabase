import type { DatabaseId, Tenant } from "metabase-types/api";

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

export function newMetabotConversation({ prompt }: { prompt: string }) {
  return `/metabot/new?q=${encodeURIComponent(prompt)}`;
}

export function newTenant() {
  return `/admin/people/tenants/new`;
}

export function editTenant(tenantId: Tenant["id"]) {
  return `/admin/people/tenants/${tenantId}/edit`;
}

export function deactivateTenant(tenantId: Tenant["id"]) {
  return `/admin/people/tenants/${tenantId}/deactivate`;
}

export function reactivateTenant(tenantId: Tenant["id"]) {
  return `/admin/people/tenants/${tenantId}/reactivate`;
}

export function editUserStrategy(page: "people" | "tenants") {
  return `/admin/people${page === "tenants" ? "/tenants" : ""}/user-strategy`;
}
