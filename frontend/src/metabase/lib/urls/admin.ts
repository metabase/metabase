import type {
  DatabaseId,
  BaseUser,
  SchemaName,
  TableId,
  UserId,
} from "metabase-types/api";

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
