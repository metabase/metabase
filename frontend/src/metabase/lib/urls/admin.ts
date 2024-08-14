import type {
  DatabaseId,
  FieldId,
  SchemaId,
  TableId,
  UserId,
} from "metabase-types/api";

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

export function dataModelSchema(databaseId: DatabaseId, schemaId: SchemaId) {
  const databaseUrl = dataModelDatabase(databaseId);
  return `${databaseUrl}/schema/${schemaId}`;
}

export function dataModelTable(
  databaseId: DatabaseId,
  schemaId: SchemaId,
  tableId: TableId,
) {
  const schemaUrl = dataModelSchema(databaseId, schemaId);
  return `${schemaUrl}/table/${tableId}`;
}

export function dataModelTableSettings(
  databaseId: DatabaseId,
  schemaId: SchemaId,
  tableId: TableId,
) {
  const tableUrl = dataModelTable(databaseId, schemaId, tableId);
  return `${tableUrl}/settings`;
}

export function dataModelField(
  databaseId: DatabaseId,
  schemaId: SchemaId,
  tableId: TableId,
  fieldId: FieldId,
) {
  const tableUrl = dataModelTable(databaseId, schemaId, tableId);
  return `${tableUrl}/field/${fieldId}/general`;
}

export function dataModelFieldFormatting(
  databaseId: DatabaseId,
  schemaId: SchemaId,
  tableId: TableId,
  fieldId: FieldId,
) {
  const tableUrl = dataModelTable(databaseId, schemaId, tableId);
  return `${tableUrl}/field/${fieldId}/formatting`;
}
