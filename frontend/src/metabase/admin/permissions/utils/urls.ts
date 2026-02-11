import type { EntityId } from "../types";

import {
  isDatabaseEntityId,
  isSchemaEntityId,
  isTableEntityId,
} from "./data-entity-id";

export const DATABASES_BASE_PATH = `/admin/permissions/data/database`;
export const GROUPS_BASE_PATH = `/admin/permissions/data/group`;

export const getDatabaseFocusPermissionsUrl = (
  entityId?: Partial<EntityId> | null,
) => {
  if (entityId == null) {
    return DATABASES_BASE_PATH;
  }

  if (isTableEntityId(entityId)) {
    return entityId.schemaName != null && entityId.schemaName !== ""
      ? `${DATABASES_BASE_PATH}/${
          entityId.databaseId
        }/schema/${encodeURIComponent(entityId.schemaName)}/table/${
          entityId.tableId
        }`
      : `${DATABASES_BASE_PATH}/${entityId.databaseId}/table/${entityId.tableId}`;
  }

  if (isSchemaEntityId(entityId)) {
    return `${DATABASES_BASE_PATH}/${
      entityId.databaseId
    }/schema/${encodeURIComponent(entityId.schemaName!)}`;
  }

  if (isDatabaseEntityId(entityId)) {
    return `${DATABASES_BASE_PATH}/${entityId.databaseId}`;
  }
};

export const getGroupFocusPermissionsUrl = (
  groupId?: number | null,
  entityId?: Partial<EntityId> | null,
) => {
  if (groupId == null) {
    return GROUPS_BASE_PATH;
  }

  if (entityId == null) {
    return `${GROUPS_BASE_PATH}/${groupId}`;
  }

  if (isDatabaseEntityId(entityId)) {
    return `${GROUPS_BASE_PATH}/${groupId}/database/${entityId.databaseId}`;
  }

  if (isSchemaEntityId(entityId)) {
    return `${GROUPS_BASE_PATH}/${groupId}/database/${
      entityId.databaseId
    }/schema/${encodeURIComponent(entityId.schemaName!)}`;
  }

  return GROUPS_BASE_PATH;
};
