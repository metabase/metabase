import { getPermissionsBasePath } from "metabase/admin/permissions/utils/base-path";
import * as TenantUrls from "metabase/common/tenants";
import type { DatabaseId, Tenant } from "metabase-types/api";

export * as Urls from "metabase/urls";

export function newTenant() {
  return `${TenantUrls.getTenantsBasePath()}/new`;
}

export function editTenant(tenantId: Tenant["id"]) {
  return `${TenantUrls.getTenantsBasePath()}/${tenantId}/edit`;
}

export function deactivateTenant(tenantId: Tenant["id"]) {
  return `${TenantUrls.getTenantsBasePath()}/${tenantId}/deactivate`;
}

export function reactivateTenant(tenantId: Tenant["id"]) {
  return `${TenantUrls.getTenantsBasePath()}/${tenantId}/reactivate`;
}

export function editUserStrategy(page: "people" | "tenants") {
  return page === "tenants"
    ? `${TenantUrls.getTenantsBasePath()}/user-strategy`
    : `/admin/people/user-strategy`;
}

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

export function tenants() {
  return TenantUrls.getTenantsBasePath();
}

export function tenantPeople() {
  return `${TenantUrls.getTenantsBasePath()}/people`;
}

export function tenantGroups() {
  return `${TenantUrls.getTenantsBasePath()}/groups`;
}

export function tenantsPermissions() {
  return getPermissionsBasePath();
}
