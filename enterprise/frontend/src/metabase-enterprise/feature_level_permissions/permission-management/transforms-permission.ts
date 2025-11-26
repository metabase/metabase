import { getIn } from "icepick";
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
} from "metabase/admin/permissions/types";
import type { Group, GroupsPermissions } from "metabase-types/api";

export const TRANSFORMS_PERMISSION_OPTIONS = {
  no: {
    get label() {
      return t`No`;
    },
    value: DataPermissionValue.NO,
    icon: "close",
    iconColor: "danger",
  },
  yes: {
    get label() {
      return t`Yes`;
    },
    value: DataPermissionValue.YES,
    icon: "check",
    iconColor: "success",
  },
};

const TRANSFORMS_PERMISSIONS_DESC = [
  TRANSFORMS_PERMISSION_OPTIONS.yes.value,
  TRANSFORMS_PERMISSION_OPTIONS.no.value,
];

const getTransformsPermission = (
  permissions: GroupsPermissions,
  groupId: number,
  databaseId: number,
) =>
  getIn(permissions, [groupId, databaseId, DataPermission.TRANSFORMS]) ??
  TRANSFORMS_PERMISSION_OPTIONS.no.value;

export const buildTransformsPermission = (
  entityId: EntityId,
  groupId: number,
  isAdmin: boolean,
  permissions: GroupsPermissions,
  defaultGroup: Group,
  permissionSubject: PermissionSubject,
): PermissionSectionConfig | null => {
  if (permissionSubject !== "schemas") {
    return null;
  }

  const value = getTransformsPermission(
    permissions,
    groupId,
    entityId.databaseId,
  );
  const defaultGroupValue = getTransformsPermission(
    permissions,
    defaultGroup.id,
    entityId.databaseId,
  );

  const warning = getPermissionWarning(
    value,
    defaultGroupValue,
    permissionSubject,
    defaultGroup,
    groupId,
    TRANSFORMS_PERMISSIONS_DESC,
  );

  const confirmations = (newValue: DataPermissionValue) => [
    getPermissionWarningModal(
      newValue,
      defaultGroupValue,
      permissionSubject,
      defaultGroup,
      groupId,
      TRANSFORMS_PERMISSIONS_DESC,
    ),
  ];

  return {
    permission: DataPermission.TRANSFORMS,
    type: DataPermissionType.TRANSFORMS,
    value,
    isDisabled: isAdmin,
    isHighlighted: isAdmin,
    warning,
    confirmations,
    disabledTooltip: isAdmin ? UNABLE_TO_CHANGE_ADMIN_PERMISSIONS : null,
    options: [
      TRANSFORMS_PERMISSION_OPTIONS.no,
      TRANSFORMS_PERMISSION_OPTIONS.yes,
    ],
  };
};
