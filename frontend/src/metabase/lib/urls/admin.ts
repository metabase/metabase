import type {
  BaseUser,
  DatabaseId,
  SchemaName,
  TableId,
} from "metabase-types/api";

export const isInternalUser = (user: BaseUser) => user.tenant_id === null;

const getPeopleRoutePrefix = (user: BaseUser) =>
  isInternalUser(user) ? "/admin/people" : "/admin/tenants/people";

export function newUser() {
  return `/admin/people/new`;
}
export function newTenantUser() {
  return "/admin/tenants/people/new";
}

export function editUser(user: BaseUser, routePrefix: string) {
  return `${routePrefix}/${user.id}/edit`;
}

export function resetPassword(user: BaseUser, routePrefix: string) {
  return `${routePrefix}/${user.id}/reset`;
}

export function newUserSuccess(user: BaseUser) {
  return `${getPeopleRoutePrefix(user)}/${user.id}/success`;
}

export function deactivateUser(user: BaseUser, routePrefix: string) {
  return `${routePrefix}/${user.id}/deactivate`;
}

export function reactivateUser(user: BaseUser) {
  return `${getPeopleRoutePrefix(user)}/${user.id}/reactivate`;
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
