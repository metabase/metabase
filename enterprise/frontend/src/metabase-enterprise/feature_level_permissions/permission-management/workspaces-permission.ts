import { getIn } from "icepick";
import { t } from "ttag";

import { Messages } from "metabase/admin/permissions/constants/messages";
import {
  getPermissionWarning,
  getPermissionWarningModal,
} from "metabase/admin/permissions/selectors/confirmations";
import {
  DataPermissionType,
  type EntityId,
  type PermissionOption,
  type PermissionSectionConfig,
  type PermissionSubject,
} from "metabase/admin/permissions/types";
import { getSchemasPermission } from "metabase/admin/permissions/utils/graph";
import {
  DataPermission,
  DataPermissionValue,
  type Group,
  type GroupsPermissions,
} from "metabase-types/api";

export const WORKSPACES_PERMISSION_OPTIONS: Record<string, PermissionOption> = {
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

const WORKSPACES_PERMISSIONS_DESC = [
  WORKSPACES_PERMISSION_OPTIONS.yes.value,
  WORKSPACES_PERMISSION_OPTIONS.no.value,
];

const getWorkspacesPermission = (
  permissions: GroupsPermissions,
  groupId: number,
  databaseId: number,
) =>
  getIn(permissions, [groupId, databaseId, DataPermission.WORKSPACES]) ??
  WORKSPACES_PERMISSION_OPTIONS.no.value;

const hasFullViewDataAccess = (viewDataValue: DataPermissionValue): boolean => {
  return viewDataValue === DataPermissionValue.UNRESTRICTED;
};

const hasFullCreateQueriesAccess = (
  createQueriesValue: DataPermissionValue,
): boolean => {
  return createQueriesValue === DataPermissionValue.QUERY_BUILDER_AND_NATIVE;
};

const getWorkspacesDisabledTooltip = (
  isAdmin: boolean,
  hasRequiredPermissions: boolean,
): string | null => {
  if (isAdmin) {
    return Messages.UNABLE_TO_CHANGE_ADMIN_PERMISSIONS;
  }

  if (!hasRequiredPermissions) {
    return t`Workspaces require "Can view" data access and "Query builder and native" for all tables in this database`;
  }

  return null;
};

export const buildWorkspacesPermission = (
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

  const viewDataValue = getSchemasPermission(
    permissions,
    groupId,
    entityId,
    DataPermission.VIEW_DATA,
  );

  const createQueriesValue = getSchemasPermission(
    permissions,
    groupId,
    entityId,
    DataPermission.CREATE_QUERIES,
  );

  const hasRequiredPermissions =
    hasFullViewDataAccess(viewDataValue) &&
    hasFullCreateQueriesAccess(createQueriesValue);

  const isDisabled = isAdmin || !hasRequiredPermissions;

  const value = hasRequiredPermissions
    ? getWorkspacesPermission(permissions, groupId, entityId.databaseId)
    : WORKSPACES_PERMISSION_OPTIONS.no.value;

  const defaultGroupValue = getWorkspacesPermission(
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
    WORKSPACES_PERMISSIONS_DESC,
  );

  const confirmations = (newValue: DataPermissionValue) => [
    getPermissionWarningModal(
      newValue,
      defaultGroupValue,
      permissionSubject,
      defaultGroup,
      groupId,
      WORKSPACES_PERMISSIONS_DESC,
    ),
  ];

  return {
    permission: DataPermission.WORKSPACES,
    type: DataPermissionType.WORKSPACES,
    value,
    isDisabled,
    isHighlighted: isAdmin,
    warning,
    confirmations,
    disabledTooltip: getWorkspacesDisabledTooltip(
      isAdmin,
      hasRequiredPermissions,
    ),
    options: [
      WORKSPACES_PERMISSION_OPTIONS.no,
      WORKSPACES_PERMISSION_OPTIONS.yes,
    ],
  };
};
