import type { DatabaseId, UserId } from "metabase-types/api";

export function newUser() {
  return `/admin/people/new`;
}

export function editUser(userId: UserId) {
  return `/admin/people/${userId}/edit`;
}

export function resetPassword(userId: UserId) {
  return `/admin/people/${userId}/reset`;
}

export function newUserSuccess(userId: UserId) {
  return `/admin/people/${userId}/success`;
}

export function deactivateUser(userId: UserId) {
  return `/admin/people/${userId}/deactivate`;
}

export function reactivateUser(userId: UserId) {
  return `/admin/people/${userId}/reactivate`;
}

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
