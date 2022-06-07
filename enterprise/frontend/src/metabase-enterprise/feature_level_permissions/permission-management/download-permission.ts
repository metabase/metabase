import { push } from "react-router-redux";
import { t } from "ttag";

import { Group, GroupsPermissions } from "metabase-types/api";
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
import { getGroupFocusPermissionsUrl } from "metabase/admin/permissions/utils/urls";
import { PLUGIN_ADVANCED_PERMISSIONS } from "metabase/plugins";

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

  const value = PLUGIN_ADVANCED_PERMISSIONS.isBlockPermission(
    dataAccessPermissionValue,
  )
    ? DOWNLOAD_PERMISSION_OPTIONS.none.value
    : getPermissionValue(permissions, groupId, entityId, permissionSubject);

  const defaultGroupValue = getPermissionValue(
    permissions,
    defaultGroup.id,
    entityId,
    permissionSubject,
  );

  const isDisabled =
    isAdmin ||
    PLUGIN_ADVANCED_PERMISSIONS.isBlockPermission(dataAccessPermissionValue);

  const disabledTooltip = getTooltipMessage(
    isAdmin,
    PLUGIN_ADVANCED_PERMISSIONS.isBlockPermission(dataAccessPermissionValue),
  );

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
