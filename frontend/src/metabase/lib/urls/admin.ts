import { DatabaseId, FieldId, TableId, UserId } from "metabase-types/api";

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

export function editDatabase(databaseId: DatabaseId) {
  return `/admin/databases/${databaseId}`;
}

export function dataModelDatabase(databaseId: DatabaseId) {
  return `/admin/datamodel/database/${databaseId}`;
}

export function dataModelSchema(databaseId: DatabaseId, schemaName: string) {
  const schemaUrl = encodeURIComponent(schemaName);
  return `${dataModelDatabase(databaseId)}/schema/${schemaUrl}`;
}

export function dataModelTable(
  databaseId: DatabaseId,
  schemaName: string,
  tableId: TableId,
) {
  return `${dataModelSchema(databaseId, schemaName)}/table/${tableId}`;
}

export function dataModelField(
  databaseId: DatabaseId,
  schemaName: string,
  tableId: TableId,
  fieldId: FieldId,
) {
  return `${dataModelTable(databaseId, schemaName, tableId)}/field/${fieldId}`;
}

export function dataModelTableSettings(
  databaseId: DatabaseId,
  schemaName: string,
  tableId: TableId,
) {
  return `${dataModelTable(databaseId, schemaName, tableId)}/settings`;
}
