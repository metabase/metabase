import { push } from "react-router-redux";
import { t } from "ttag";

import { UNABLE_TO_CHANGE_ADMIN_PERMISSIONS } from "metabase/admin/permissions/constants/messages";
import {
  getPermissionWarning,
  getPermissionWarningModal,
} from "metabase/admin/permissions/selectors/confirmations";
import {
  DataPermission,
  DataPermissionType,
  DataPermissionValue,
  type EntityId,
  type PermissionSectionConfig,
  type PermissionSubject,
  type SchemaEntityId,
  type TableEntityId,
} from "metabase/admin/permissions/types";
import {
  getFieldsPermission,
  getSchemasPermission,
  getTablesPermission,
} from "metabase/admin/permissions/utils/graph";
import { getGroupFocusPermissionsUrl } from "metabase/admin/permissions/utils/urls";
import type { Group, GroupsPermissions } from "metabase-types/api";

export const DATA_MODEL_PERMISSION_OPTIONS = {
  none: {
    label: t`No`,
    value: DataPermissionValue.NONE,
    icon: "close",
    iconColor: "danger",
  },
  edit: {
    label: t`Yes`,
    value: DataPermissionValue.ALL,
    icon: "check",
    iconColor: "success",
  },
  controlled: {
    label: t`Granular`,
    value: DataPermissionValue.CONTROLLED,
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
): DataPermissionValue => {
  switch (permissionSubject) {
    case "fields":
      return getFieldsPermission(
        permissions,
        groupId,
        entityId as TableEntityId,
        DataPermission.DATA_MODEL,
      );
    case "tables":
      return getTablesPermission(
        permissions,
        groupId,
        entityId as SchemaEntityId,
        DataPermission.DATA_MODEL,
      );
    default:
      return getSchemasPermission(
        permissions,
        groupId,
        entityId,
        DataPermission.DATA_MODEL,
      );
  }
};

export const buildDataModelPermission = (
  entityId: EntityId,
  groupId: number,
  isAdmin: boolean,
  permissions: GroupsPermissions,
  defaultGroup: Group,
  permissionSubject: PermissionSubject,
): PermissionSectionConfig => {
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

  const confirmations = (newValue: DataPermissionValue) => [
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
    permission: DataPermission.DATA_MODEL,
    type: DataPermissionType.DATA_MODEL,
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
