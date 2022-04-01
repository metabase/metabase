import { push } from "react-router-redux";
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
import { t } from "ttag";

export const DATA_MODEL_PERMISSION_REQUIRES_DATA_ACCESS = t`Data model access requires full data access.`;

export const DATA_MODEL_PERMISSION_OPTIONS = {
  none: {
    label: t`No`,
    value: "none",
    icon: "close",
    iconColor: "danger",
  },
  edit: {
    label: t`Edit`,
    value: "all",
    icon: "pencil",
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
        "data-model",
      );
    case "tables":
      return getTablesPermission(
        permissions,
        groupId,
        entityId as SchemaEntityId,
        "data-model",
      );
    default:
      return getSchemasPermission(permissions, groupId, entityId, "data-model");
  }
};

export const buildDataModelPermission = (
  entityId: EntityId,
  groupId: number,
  isAdmin: boolean,
  permissions: GroupsPermissions,
  dataAccessPermissionValue: string,
  permissionSubject: PermissionSubject,
) => {
  const hasChildEntities = permissionSubject !== "fields";

  const value = isRestrictivePermission(dataAccessPermissionValue)
    ? DATA_MODEL_PERMISSION_OPTIONS.none.value
    : getPermissionValue(permissions, groupId, entityId, permissionSubject);

  const isDisabled =
    isAdmin || isRestrictivePermission(dataAccessPermissionValue);

  return {
    permission: "data-model",
    type: "data-model",
    isDisabled,
    disabledTooltip: isAdmin
      ? UNABLE_TO_CHANGE_ADMIN_PERMISSIONS
      : DATA_MODEL_PERMISSION_REQUIRES_DATA_ACCESS,
    isHighlighted: isAdmin,
    value,
    options: [
      DATA_MODEL_PERMISSION_OPTIONS.none,
      ...(hasChildEntities ? [DATA_MODEL_PERMISSION_OPTIONS.controlled] : []),
      DATA_MODEL_PERMISSION_OPTIONS.edit,
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
