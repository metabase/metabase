import { getIn } from "icepick";
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
} from "metabase/admin/permissions/types";
import { getSchemasPermission } from "metabase/admin/permissions/utils/graph";
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

const hasFullViewDataAccess = (viewDataValue: DataPermissionValue): boolean => {
  return viewDataValue === DataPermissionValue.UNRESTRICTED;
};

const hasFullCreateQueriesAccess = (
  createQueriesValue: DataPermissionValue,
): boolean => {
  return createQueriesValue === DataPermissionValue.QUERY_BUILDER_AND_NATIVE;
};

const getTransformsDisabledTooltip = (
  isAdmin: boolean,
  hasRequiredPermissions: boolean,
): string | null => {
  if (isAdmin) {
    return Messages.UNABLE_TO_CHANGE_ADMIN_PERMISSIONS;
  }

  if (!hasRequiredPermissions) {
    return t`Transforms require "Can view" data access and "Query builder and native" for all tables in this database`;
  }

  return null;
};

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
    ? getTransformsPermission(permissions, groupId, entityId.databaseId)
    : TRANSFORMS_PERMISSION_OPTIONS.no.value;

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
    isDisabled,
    isHighlighted: isAdmin,
    warning,
    confirmations,
    disabledTooltip: getTransformsDisabledTooltip(
      isAdmin,
      hasRequiredPermissions,
    ),
    options: [
      TRANSFORMS_PERMISSION_OPTIONS.no,
      TRANSFORMS_PERMISSION_OPTIONS.yes,
    ],
  };
};
