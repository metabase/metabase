import { getPermissionsBasePath } from "metabase/common/components/PermissionsBasePath/base-path";
import type { GroupId, PermissionEntityId } from "metabase-types/api";

import {
  isDatabaseEntityId,
  isSchemaEntityId,
  isTableEntityId,
} from "./data-entity-id";

export const getDatabasesBasePath = () =>
  `${getPermissionsBasePath()}/data/database`;
export const getGroupsBasePath = () => `${getPermissionsBasePath()}/data/group`;

export const getDatabaseFocusPermissionsUrl = (
  entityId?: PermissionEntityId,
) => {
  if (entityId == null) {
    return getDatabasesBasePath();
  }

  if (isTableEntityId(entityId)) {
    return entityId.schemaName != null && entityId.schemaName !== ""
      ? `${getDatabasesBasePath()}/${
          entityId.databaseId
        }/schema/${encodeURIComponent(entityId.schemaName)}/table/${
          entityId.tableId
        }`
      : `${getDatabasesBasePath()}/${entityId.databaseId}/table/${entityId.tableId}`;
  }

  if (isSchemaEntityId(entityId)) {
    return `${getDatabasesBasePath()}/${
      entityId.databaseId
    }/schema/${encodeURIComponent(entityId.schemaName)}`;
  }

  if (isDatabaseEntityId(entityId)) {
    return `${getDatabasesBasePath()}/${entityId.databaseId}`;
  }

  return getDatabasesBasePath();
};

export const getGroupFocusPermissionsUrl = (
  groupId?: GroupId,
  entityId?: PermissionEntityId,
) => {
  if (groupId == null) {
    return getGroupsBasePath();
  }

  if (entityId == null) {
    return `${getGroupsBasePath()}/${groupId}`;
  }

  if (isSchemaEntityId(entityId)) {
    return `${getGroupsBasePath()}/${groupId}/database/${
      entityId.databaseId
    }/schema/${encodeURIComponent(entityId.schemaName)}`;
  }

  if (isDatabaseEntityId(entityId)) {
    return `${getGroupsBasePath()}/${groupId}/database/${entityId.databaseId}`;
  }

  return getGroupsBasePath();
};
