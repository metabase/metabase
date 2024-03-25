import _ from "underscore";

import { getNativePermissionDisabledTooltip } from "metabase/admin/permissions/selectors/data-permissions/shared";
import {
  getNativePermission,
  getSchemasPermission,
} from "metabase/admin/permissions/utils/graph";
import {
  PLUGIN_ADMIN_PERMISSIONS_DATABASE_ACTIONS,
  PLUGIN_ADMIN_PERMISSIONS_DATABASE_POST_ACTIONS,
  PLUGIN_ADVANCED_PERMISSIONS,
  PLUGIN_FEATURE_LEVEL_PERMISSIONS,
} from "metabase/plugins";
import type Database from "metabase-lib/v1/metadata/Database";
import type { Group, GroupsPermissions } from "metabase-types/api";

import { DATA_PERMISSION_OPTIONS } from "../../constants/data-permissions";
import { UNABLE_TO_CHANGE_ADMIN_PERMISSIONS } from "../../constants/messages";
import { granulateDatabasePermissions } from "../../permissions";
import type { DatabaseEntityId } from "../../types";
import {
  getPermissionWarning,
  getPermissionWarningModal,
  getRawQueryWarningModal,
} from "../confirmations";

const buildAccessPermission = (
  entityId: DatabaseEntityId,
  groupId: number,
  isAdmin: boolean,
  permissions: GroupsPermissions,
  originalPermissions: GroupsPermissions,
  defaultGroup: Group,
  database: Database,
) => {
  const accessPermissionConfirmations = (newValue: string) => [
    getPermissionWarningModal(
      newValue,
      defaultGroupAccessPermissionValue,
      "schemas",
      defaultGroup,
      groupId,
    ),
  ];

  const accessPermissionValue = getSchemasPermission(
    permissions,
    groupId,
    entityId,
    "view-data",
  );
  const originalAccessPermissionValue = getSchemasPermission(
    originalPermissions,
    groupId,
    entityId,
    "view-data",
  );
  const defaultGroupAccessPermissionValue = getSchemasPermission(
    permissions,
    defaultGroup.id,
    entityId,
    "view-data",
  );
  const accessPermissionWarning = getPermissionWarning(
    accessPermissionValue,
    defaultGroupAccessPermissionValue,
    "schemas",
    defaultGroup,
    groupId,
  );

  return {
    permission: "view-data",
    type: "access",
    isDisabled: isAdmin,
    disabledTooltip: isAdmin ? UNABLE_TO_CHANGE_ADMIN_PERMISSIONS : null,
    isHighlighted: isAdmin,
    value: accessPermissionValue,
    warning: accessPermissionWarning,
    confirmations: accessPermissionConfirmations,
    options: PLUGIN_ADVANCED_PERMISSIONS.addDatabasePermissionOptions(
      _.compact([
        DATA_PERMISSION_OPTIONS.all,
        DATA_PERMISSION_OPTIONS.controlled,
        originalAccessPermissionValue ===
          DATA_PERMISSION_OPTIONS.noSelfService.value &&
          DATA_PERMISSION_OPTIONS.noSelfService,
      ]),
      database,
    ),
    postActions: {
      controlled: (_, __, ___, accessPermissionValue) =>
        granulateDatabasePermissions(
          groupId,
          entityId,
          { type: "access", permission: "view-data" },
          accessPermissionValue,
          DATA_PERMISSION_OPTIONS.all.value,
        ),
      ...PLUGIN_ADMIN_PERMISSIONS_DATABASE_POST_ACTIONS,
    },
    actions: PLUGIN_ADMIN_PERMISSIONS_DATABASE_ACTIONS,
  };
};

const buildNativePermission = (
  entityId: DatabaseEntityId,
  groupId: number,
  isAdmin: boolean,
  permissions: GroupsPermissions,
  defaultGroup: Group,
  accessPermissionValue: string,
) => {
  const nativePermissionValue = getNativePermission(
    permissions,
    groupId,
    entityId,
  );

  const defaultGroupNativePermissionValue = getNativePermission(
    permissions,
    defaultGroup.id,
    entityId,
  );
  const nativePermissionWarning = getPermissionWarning(
    nativePermissionValue,
    defaultGroupNativePermissionValue,
    null,
    defaultGroup,
    groupId,
  );

  const nativePermissionConfirmations = (newValue: string) => [
    getPermissionWarningModal(
      newValue,
      defaultGroupNativePermissionValue,
      null,
      defaultGroup,
      groupId,
    ),
    getRawQueryWarningModal(permissions, groupId, entityId, newValue),
  ];

  const disabledTooltip = getNativePermissionDisabledTooltip(
    isAdmin,
    accessPermissionValue,
  );

  return {
    permission: "create-queries",
    type: "native",
    isDisabled: disabledTooltip != null,
    disabledTooltip,
    isHighlighted: isAdmin,
    value: nativePermissionValue,
    warning: nativePermissionWarning,
    confirmations: nativePermissionConfirmations,
    options: [
      DATA_PERMISSION_OPTIONS.queryBuilderAndNative,
      DATA_PERMISSION_OPTIONS.controlled,
      DATA_PERMISSION_OPTIONS.queryBuilder,
      DATA_PERMISSION_OPTIONS.no,
    ],
    postActions: {
      controlled: (_, __, ___, accessPermissionValue) =>
        granulateDatabasePermissions(
          groupId,
          entityId,
          { type: "native", permission: "create-queries" },
          accessPermissionValue,
          DATA_PERMISSION_OPTIONS.queryBuilderAndNative.value,
        ),
    },
  };
};

export const buildSchemasPermissions = (
  entityId: DatabaseEntityId,
  groupId: number,
  isAdmin: boolean,
  permissions: GroupsPermissions,
  originalPermissions: GroupsPermissions,
  defaultGroup: Group,
  database: Database,
) => {
  const accessPermission = buildAccessPermission(
    entityId,
    groupId,
    isAdmin,
    permissions,
    originalPermissions,
    defaultGroup,
    database,
  );

  const nativePermission = buildNativePermission(
    entityId,
    groupId,
    isAdmin,
    permissions,
    defaultGroup,
    accessPermission.value,
  );

  return [
    accessPermission,
    nativePermission,
    ...PLUGIN_FEATURE_LEVEL_PERMISSIONS.getFeatureLevelDataPermissions(
      entityId,
      groupId,
      isAdmin,
      permissions,
      accessPermission.value,
      defaultGroup,
      "schemas",
    ),
  ];
};
