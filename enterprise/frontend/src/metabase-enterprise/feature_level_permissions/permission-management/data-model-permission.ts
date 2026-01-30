import { push } from "react-router-redux";
import { t } from "ttag";

import { Messages } from "metabase/admin/permissions/constants/messages";
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
  type SpecialGroupType,
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
    // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
    label: t`No`,
    value: DataPermissionValue.NONE,
    icon: "close",
    iconColor: "danger",
  },
  edit: {
    // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
    label: t`Yes`,
    value: DataPermissionValue.ALL,
    icon: "check",
    iconColor: "success",
  },
  controlled: {
    // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
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

const getDisabledTooltip = (groupType: SpecialGroupType) => {
  switch (groupType) {
    case "admin":
      return Messages.UNABLE_TO_CHANGE_ADMIN_PERMISSIONS;
    case "analyst":
      return Messages.UNABLE_TO_CHANGE_DATA_ANALYST_PERMISSIONS;
    case "external":
      return Messages.EXTERNAL_USERS_NO_ACCESS_DATABASE;
    default:
      return null;
  }
};

export const buildDataModelPermission = (
  entityId: EntityId,
  groupId: number,
  groupType: SpecialGroupType,
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

  const disabledTooltip = getDisabledTooltip(groupType);

  return {
    permission: DataPermission.DATA_MODEL,
    type: DataPermissionType.DATA_MODEL,
    isDisabled: disabledTooltip !== null,
    warning,
    confirmations,
    value,
    isHighlighted: groupType === "admin" || groupType === "analyst",
    disabledTooltip,
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
