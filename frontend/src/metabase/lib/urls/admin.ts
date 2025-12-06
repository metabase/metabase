import type {
  DatabaseId,
  FieldId,
  SchemaName,
  SegmentId,
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
