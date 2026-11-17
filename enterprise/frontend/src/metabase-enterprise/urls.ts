import { getPermissionsBasePath } from "metabase/common/components/PermissionsBasePath/base-path";
import { getTenantsBasePath } from "metabase/common/tenants";
import type { DatabaseId, Tenant } from "metabase-types/api";

export * as Urls from "metabase/urls";

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

export function newTenant() {
  return `${getTenantsBasePath()}/new`;
}

export function editTenant(tenantId: Tenant["id"]) {
  return `${getTenantsBasePath()}/${tenantId}/edit`;
}

export function deactivateTenant(tenantId: Tenant["id"]) {
  return `${getTenantsBasePath()}/${tenantId}/deactivate`;
}

export function reactivateTenant(tenantId: Tenant["id"]) {
  return `${getTenantsBasePath()}/${tenantId}/reactivate`;
}

export function editUserStrategy(page: "people" | "tenants") {
  return page === "tenants"
    ? `${getTenantsBasePath()}/user-strategy`
    : `/admin/people/user-strategy`;
}

export function tenants() {
  return getTenantsBasePath();
}

export function tenantPeople() {
  return `${getTenantsBasePath()}/people`;
}

export function tenantGroups() {
  return `${getTenantsBasePath()}/groups`;
}

export function tenantsPermissions() {
  return getPermissionsBasePath();
}
