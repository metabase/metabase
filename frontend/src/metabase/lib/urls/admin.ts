import { DatabaseId, UserId } from "metabase-types/api";
import { getUrl } from "./utils";

export function newUser() {
  return getUrl(`/admin/people/new`);
}

export function editUser(userId: UserId) {
  return getUrl(`/admin/people/${userId}/edit`);
}

export function resetPassword(userId: UserId) {
  return getUrl(`/admin/people/${userId}/reset`);
}

export function newUserSuccess(userId: UserId) {
  return getUrl(`/admin/people/${userId}/success`);
}

export function deactivateUser(userId: UserId) {
  return getUrl(`/admin/people/${userId}/deactivate`);
}

export function reactivateUser(userId: UserId) {
  return getUrl(`/admin/people/${userId}/reactivate`);
}

export function newDatabase() {
  return getUrl(`/admin/databases/create`);
}

export function editDatabase(databaseId: DatabaseId) {
  return getUrl(`/admin/databases/${databaseId}`);
}
