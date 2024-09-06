import type {
  DatabaseId,
  FieldId,
  SchemaId,
  TableId,
  UserId,
} from "metabase-types/api";

export function newUser() {
  return `/settings/people/new`;
}

export function editUser(userId: UserId) {
  return `/settings/people/${userId}/edit`;
}

export function resetPassword(userId: UserId) {
  return `/settings/people/${userId}/reset`;
}

export function newUserSuccess(userId: UserId) {
  return `/settings/people/${userId}/success`;
}

export function deactivateUser(userId: UserId) {
  return `/settings/people/${userId}/deactivate`;
}

export function reactivateUser(userId: UserId) {
  return `/settings/people/${userId}/reactivate`;
}

export function newDatabase() {
  if (window.location.pathname.startsWith("/settings")) {
    return `/settings/databases/create`;
  } else {
    return `/admin/databases/create`;
  }
}

export function editDatabase(databaseId: DatabaseId) {
  if (window.location.pathname.startsWith("/settings")) {
    return `/settings/databases/${databaseId}`;
  } else {
    return `/admin/databases/${databaseId}`;
  }
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
