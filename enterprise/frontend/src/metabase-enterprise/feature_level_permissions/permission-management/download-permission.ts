import { push } from "react-router-redux";
import { t } from "ttag";

import { UNABLE_TO_CHANGE_ADMIN_PERMISSIONS } from "metabase/admin/permissions/constants/messages";
import {
  getPermissionWarning,
  getPermissionWarningModal,
} from "metabase/admin/permissions/selectors/confirmations";
import type {
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
import { getGroupFocusPermissionsUrl } from "metabase/admin/permissions/utils/urls";
import type { Group, GroupsPermissions } from "metabase-types/api";

export const UNABLE_TO_DOWNLOAD_RESULTS = t`Groups with Block data access can't download results`;

const getTooltipMessage = (isAdmin: boolean, isBlockedAccess: boolean) => {
  if (isAdmin) {
    return UNABLE_TO_CHANGE_ADMIN_PERMISSIONS;
  }

  if (isBlockedAccess) {
    return UNABLE_TO_DOWNLOAD_RESULTS;
  }

  return null;
};

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

const DOWNLOAD_PERMISSIONS_DESC = [
  DOWNLOAD_PERMISSION_OPTIONS.full.value,
  DOWNLOAD_PERMISSION_OPTIONS.limited.value,
  DOWNLOAD_PERMISSION_OPTIONS.controlled.value,
  DOWNLOAD_PERMISSION_OPTIONS.none.value,
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
  defaultGroup: Group,
  permissionSubject: PermissionSubject,
) => {
  const hasChildEntities = permissionSubject !== "fields";
  const isBlockPermission = dataAccessPermissionValue === "blocked";

  const value = isBlockPermission
    ? DOWNLOAD_PERMISSION_OPTIONS.none.value
    : getPermissionValue(permissions, groupId, entityId, permissionSubject);

  const defaultGroupValue = getPermissionValue(
    permissions,
    defaultGroup.id,
    entityId,
    permissionSubject,
  );

  const isDisabled = isAdmin || isBlockPermission;

  const disabledTooltip = getTooltipMessage(isAdmin, isBlockPermission);

  const warning = getPermissionWarning(
    value,
    defaultGroupValue,
    permissionSubject,
    defaultGroup,
    groupId,
    DOWNLOAD_PERMISSIONS_DESC,
  );

  const confirmations = (newValue: string) => [
    getPermissionWarningModal(
      newValue,
      defaultGroupValue,
      permissionSubject,
      defaultGroup,
      groupId,
      DOWNLOAD_PERMISSIONS_DESC,
    ),
  ];

  return {
    permission: "download",
    type: "download",
    isDisabled,
    disabledTooltip,
    value,
    warning,
    confirmations,
    isHighlighted: isAdmin,
    options: [
      DOWNLOAD_PERMISSION_OPTIONS.none,
      ...(hasChildEntities ? [DOWNLOAD_PERMISSION_OPTIONS.controlled] : []),
      DOWNLOAD_PERMISSION_OPTIONS.limited,
      DOWNLOAD_PERMISSION_OPTIONS.full,
    ],
    postActions: hasChildEntities
      ? {
          controlled: () =>
            push(getGroupFocusPermissionsUrl(groupId, entityId)),
        }
      : undefined,
  };
};
