import { push } from "react-router-redux";
import { t } from "ttag";
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
} from "metabase/admin/permissions/utils/graph";
import { PLUGIN_ADVANCED_PERMISSIONS } from "metabase/plugins";

export const DOWNLOAD_PERMISSION_REQUIRES_DATA_ACCESS = t`Download results access requires full data access.`;

export const DOWNLOAD_PERMISSION_OPTIONS = {
  none: {
    label: t`No`,
    value: "none",
    icon: "close",
    iconColor: "danger",
  },
  limited: {
    label: t`10 thousand rows`,
    value: "limited",
    icon: "10k",
    iconColor: "accent7",
  },
  full: {
    label: t`1 million rows`,
    value: "full",
    icon: "1m",
    iconColor: "accent7",
  },
  controlled: {
    label: t`Granular`,
    value: "controlled",
    icon: "permissions_limited",
    iconColor: "warning",
  },
};

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

export const buildDownloadPermission = (
  entityId: EntityId,
  groupId: number,
  isAdmin: boolean,
  permissions: GroupsPermissions,
  dataAccessPermissionValue: string,
  permissionSubject: PermissionSubject,
) => {
  const hasChildEntities = permissionSubject !== "fields";

  const value = PLUGIN_ADVANCED_PERMISSIONS.isBlockPermission(
    dataAccessPermissionValue,
  )
    ? DOWNLOAD_PERMISSION_OPTIONS.none.value
    : getPermissionValue(permissions, groupId, entityId, permissionSubject);

  const isDisabled =
    isAdmin ||
    PLUGIN_ADVANCED_PERMISSIONS.isBlockPermission(dataAccessPermissionValue);

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
