import type { BaseUser, DatabaseId } from "metabase-types/api";

export const isInternalUser = (user: BaseUser) => user.tenant_id === null;

export function newUser() {
  return `/admin/people/new`;
}
export function newTenantUser() {
  return "/admin/tenants/people/new";
}

export function editUser(user: BaseUser) {
  return isInternalUser(user)
    ? `/admin/people/${user.id}/edit`
    : `/admin/tenants/people/${user.id}/edit`;
}

export function resetPassword(user: BaseUser) {
  return isInternalUser(user)
    ? `/admin/people/${user.id}/reset`
    : `/admin/tenants/people/${user.id}/reset`;
}

export function newUserSuccess(user: BaseUser) {
  return isInternalUser(user)
    ? `/admin/people/${user.id}/success`
    : `/admin/tenants/people/${user.id}/success`;
}

export function deactivateUser(user: BaseUser) {
  return isInternalUser(user)
    ? `/admin/people/${user.id}/deactivate`
    : `/admin/tenants/people/${user.id}/deactivate`;
}

export function reactivateUser(user: BaseUser) {
  return isInternalUser(user)
    ? `/admin/people/${user.id}/reactivate`
    : `/admin/tenants/people/${user.id}/reactivate`;
}

// TODO: move to EE urls

export function newDatabase() {
  return `/admin/databases/create`;
}

export function viewDatabases() {
  return `/admin/databases`;
}

export function viewDatabase(databaseId: DatabaseId) {
  return `/admin/databases/${databaseId}`;
}

export function editDatabase(databaseId: DatabaseId) {
  return `/admin/databases/${databaseId}/edit`;
}

export function dataModelDatabase(databaseId: DatabaseId) {
  return `/admin/datamodel/database/${databaseId}`;
}

export function uploadsSettings() {
  return "/admin/settings/uploads";
}

export function adminLicense() {
  return "/admin/settings/license";
}
