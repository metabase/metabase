import type {
  DatabaseId,
  SchemaName,
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

export function viewDatabases() {
  return `/admin/databases`;
}

export function viewDatabase(databaseId: DatabaseId) {
  return `/admin/databases/${databaseId}`;
}

export function editDatabase(databaseId: DatabaseId) {
  return `/admin/databases/${databaseId}/edit`;
}

export function dataModel() {
  return `/admin/datamodel`;
}

export function dataModelDatabase(databaseId: DatabaseId) {
  return `${dataModel()}/database/${databaseId}`;
}

export function dataModelSchema(
  databaseId: DatabaseId,
  schema: SchemaName | null,
) {
  return `${dataModelDatabase(databaseId)}/schema/${databaseId}:${encodeURIComponent(schema ?? "")}`;
}

export function dataModelTable(
  databaseId: DatabaseId,
  schema: SchemaName | null,
  tableId: TableId,
) {
  return `${dataModelSchema(databaseId, schema)}/table/${tableId}`;
}

export function uploadsSettings() {
  return "/admin/settings/uploads";
}

export function adminLicense() {
  return "/admin/settings/license";
}

export function adminToolsHelp() {
  return "/admin/tools/help";
}

export function adminToolsTasks() {
  return "/admin/tools/tasks";
}

export function adminToolsJobs() {
  return "/admin/tools/jobs";
}

export function adminToolsLogs() {
  return "/admin/tools/logs";
}

export function adminToolsErrors() {
  return "/admin/tools/errors";
}

export function adminToolsModelCaching() {
  return "/admin/tools/model-caching";
}

export function adminToolsGrantAccess() {
  return "/admin/tools/help/grant-access";
}
