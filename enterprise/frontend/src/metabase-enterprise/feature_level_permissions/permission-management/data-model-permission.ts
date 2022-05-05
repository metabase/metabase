import { push } from "react-router-redux";
import { Group, GroupsPermissions } from "metabase-types/api";
import { t } from "ttag";
import { getGroupFocusPermissionsUrl } from "metabase/admin/permissions/utils/urls";
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
import {
  getPermissionWarning,
  getPermissionWarningModal,
} from "metabase/admin/permissions/selectors/confirmations";

export const DATA_MODEL_PERMISSION_OPTIONS = {
  none: {
    label: t`No`,
    value: "none",
    icon: "close",
    iconColor: "danger",
  },
  edit: {
    label: t`Yes`,
    value: "all",
    icon: "check",
    iconColor: "success",
  },
  controlled: {
    label: t`Granular`,
    value: "controlled",
    icon: "permissions_limited",
    iconColor: "warning",
  },
};

const DATA_MODEL_PERMISSIONS_DESC = [
  DATA_MODEL_PERMISSION_OPTIONS.edit.value,
  DATA_MODEL_PERMISSION_OPTIONS.controlled.value,
  DATA_MODEL_PERMISSION_OPTIONS.none.value,
];

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
  defaultGroup: Group,
  permissionSubject: PermissionSubject,
) => {
  const hasChildEntities = permissionSubject !== "fields";

  const value = getPermissionValue(
    permissions,
    groupId,
    entityId,
    permissionSubject,
  );

  const defaultGroupValue = getPermissionValue(
    permissions,
    defaultGroup.id,
    entityId,
    permissionSubject,
  );

  const warning = getPermissionWarning(
    value,
    defaultGroupValue,
    permissionSubject,
    defaultGroup,
    groupId,
    DATA_MODEL_PERMISSIONS_DESC,
  );

  const confirmations = (newValue: string) => [
    getPermissionWarningModal(
      newValue,
      defaultGroupValue,
      permissionSubject,
      defaultGroup,
      groupId,
      DATA_MODEL_PERMISSIONS_DESC,
    ),
  ];

  return {
    permission: "data-model",
    type: "data-model",
    isDisabled: isAdmin,
    warning,
    confirmations,
    value,
    isHighlighted: isAdmin,
    disabledTooltip: isAdmin ? UNABLE_TO_CHANGE_ADMIN_PERMISSIONS : null,
    options: [
      DATA_MODEL_PERMISSION_OPTIONS.none,
      ...(hasChildEntities ? [DATA_MODEL_PERMISSION_OPTIONS.controlled] : []),
      DATA_MODEL_PERMISSION_OPTIONS.edit,
    ],
    postActions: hasChildEntities
      ? {
          controlled: () =>
            push(getGroupFocusPermissionsUrl(groupId, entityId)),
        }
      : undefined,
  };
};
