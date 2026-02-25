import type {
  BaseUser,
  DatabaseId,
  FieldId,
  SchemaName,
  SegmentId,
  TableId,
} from "metabase-types/api";

export const isInternalUser = (user: BaseUser) => user.tenant_id === null;

export function newUser() {
  return `/admin/people/new`;
}
export function newTenantUser() {
  return "/admin/people/tenants/people/new";
}

export function editUser(user: BaseUser) {
  return isInternalUser(user)
    ? `/admin/people/${user.id}/edit`
    : `/admin/people/tenants/people/${user.id}/edit`;
}

export function resetPassword(user: BaseUser) {
  return isInternalUser(user)
    ? `/admin/people/${user.id}/reset`
    : `/admin/people/tenants/people/${user.id}/reset`;
}

export function newUserSuccess(user: BaseUser) {
  return isInternalUser(user)
    ? `/admin/people/${user.id}/success`
    : `/admin/people/tenants/people/${user.id}/success`;
}

export function deactivateUser(user: BaseUser) {
  return isInternalUser(user)
    ? `/admin/people/${user.id}/deactivate`
    : `/admin/people/tenants/people/${user.id}/deactivate`;
}

export function reactivateUser(user: BaseUser) {
  return isInternalUser(user)
    ? `/admin/people/${user.id}/reactivate`
    : `/admin/people/tenants/people/${user.id}/reactivate`;
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

export function editDatabaseWritableConnection(databaseId: DatabaseId) {
  return `/admin/databases/${databaseId}/write-data`;
}

type DataModelParams = {
  databaseId?: DatabaseId;
  schemaName?: SchemaName | null;
  tableId?: TableId;
  fieldId?: FieldId;
};

export function dataModel({
  databaseId,
  schemaName,
  tableId,
  fieldId,
}: DataModelParams = {}) {
  const parts = ["/admin/datamodel"];

  if (databaseId != null) {
    parts.push("database", String(databaseId));

    if (schemaName != null) {
      const schemaId = `${databaseId}:${encodeURIComponent(schemaName)}`;
      parts.push("schema", schemaId);

      if (tableId != null) {
        parts.push("table", String(tableId));

        if (fieldId != null) {
          parts.push("field", String(fieldId));
        }
      }
    }
  }

  return parts.join("/");
}

export type DataModelSegmentsParams = {
  tableId?: TableId;
};

export function dataModelSegments({ tableId }: DataModelSegmentsParams = {}) {
  const params = new URLSearchParams();
  if (tableId != null) {
    params.set("table", String(tableId));
  }

  const baseUrl = "/admin/datamodel/segments";
  const queryString = params.toString();
  return queryString.length > 0 ? `${baseUrl}?${queryString}` : baseUrl;
}

export function newDataModelSegment() {
  return "/admin/datamodel/segment/create";
}

export function dataModelSegment(segmentId: SegmentId) {
  return `/admin/datamodel/segment/${segmentId}`;
}

export function dataModelSegmentRevisions(segmentId: SegmentId) {
  return `${dataModelSegment(segmentId)}/revisions`;
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

export function adminToolsTasksBase() {
  return "/admin/tools/tasks";
}
export function adminToolsTasksList() {
  return `${adminToolsTasksBase()}/list`;
}

export function adminToolsTaskDetails(taskId: number) {
  return `${adminToolsTasksList()}/${taskId}`;
}

export function adminToolsTasksRuns() {
  return `${adminToolsTasksBase()}/runs`;
}

export function adminToolsTaskRunDetails(runId: number) {
  return `${adminToolsTasksRuns()}/${runId}`;
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
