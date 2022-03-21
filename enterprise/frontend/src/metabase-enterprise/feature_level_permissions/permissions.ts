import { GroupsPermissions } from "metabase-types/api";
import { UNABLE_TO_CHANGE_ADMIN_PERMISSIONS } from "metabase/admin/permissions/constants/messages";
import {
  EntityId,
  PermissionSubject,
  SchemaEntityId,
  TableEntityId,
} from "metabase/admin/permissions/types";
import {
  getFieldsPermission,
  getSchemasPermission,
  getTablesPermission,
  isRestrictivePermission,
} from "metabase/admin/permissions/utils/graph";
import { push } from "react-router-redux";
import {
  DOWNLOAD_PERMISSION_OPTIONS,
  DOWNLOAD_PERMISSION_REQUIRES_DATA_ACCESS,
} from "./constants";

const buildControlledActionUrl = (
  entityId: EntityId,
  groupId: number,
  permissionSubject: PermissionSubject,
) => {
  if (permissionSubject === "schemas") {
    return `/admin/permissions/data/group/${groupId}/database/${entityId.databaseId}`;
  }

  return `/admin/permissions/data/group/${groupId}/database/${entityId.databaseId}/schema/${entityId.schemaName}`;
};

const getPermissionValue = (
  permissions: GroupsPermissions,
  groupId: number,
  entityId: EntityId,
  permissionSubject: PermissionSubject,
) => {
  switch (permissionSubject) {
    case "fields":
      return getFieldsPermission(
        permissions,
        groupId,
        entityId as TableEntityId,
        "download",
      );
    case "tables":
      return getTablesPermission(
        permissions,
        groupId,
        entityId as SchemaEntityId,
        "download",
      );
    default:
      return getSchemasPermission(permissions, groupId, entityId, "download");
  }
};

const buildDownloadPermission = (
  entityId: EntityId,
  groupId: number,
  isAdmin: boolean,
  permissions: GroupsPermissions,
  dataAccessPermissionValue: string,
  permissionSubject: PermissionSubject,
) => {
  const hasChildEntities = permissionSubject !== "fields";

  const value = isRestrictivePermission(dataAccessPermissionValue)
    ? DOWNLOAD_PERMISSION_OPTIONS.none.value
    : getPermissionValue(permissions, groupId, entityId, permissionSubject);

  const isDisabled =
    isAdmin || isRestrictivePermission(dataAccessPermissionValue);

  return {
    permission: "download",
    type: "download",
    isDisabled,
    disabledTooltip: isAdmin
      ? UNABLE_TO_CHANGE_ADMIN_PERMISSIONS
      : DOWNLOAD_PERMISSION_REQUIRES_DATA_ACCESS,
    isHighlighted: isAdmin,
    value,
    options: [
      DOWNLOAD_PERMISSION_OPTIONS.none,
      ...(hasChildEntities ? [DOWNLOAD_PERMISSION_OPTIONS.controlled] : []),
      DOWNLOAD_PERMISSION_OPTIONS.limited,
      DOWNLOAD_PERMISSION_OPTIONS.full,
    ],
    postActions: hasChildEntities
      ? {
          controlled: () =>
            push(
              buildControlledActionUrl(entityId, groupId, permissionSubject),
            ),
        }
      : undefined,
  };
};

export const getFeatureLevelDataPermissions = (
  entityId: EntityId,
  groupId: number,
  isAdmin: boolean,
  permissions: GroupsPermissions,
  dataAccessPermissionValue: string,
  permissionSubject: PermissionSubject,
) => {
  const downloadPermission = buildDownloadPermission(
    entityId,
    groupId,
    isAdmin,
    permissions,
    dataAccessPermissionValue,
    permissionSubject,
  );
  return [downloadPermission];
};
