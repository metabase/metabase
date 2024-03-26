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
import type {
  DatabaseEntityId,
  DataPermissionValue,
  PermissionSectionConfig,
} from "../../types";
import { DataPermission, DataPermissionType } from "../../types";
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
): PermissionSectionConfig => {
  const accessPermissionConfirmations = (newValue: DataPermissionValue) => [
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
    DataPermission.VIEW_DATA,
  );
  const originalAccessPermissionValue = getSchemasPermission(
    originalPermissions,
    groupId,
    entityId,
    DataPermission.VIEW_DATA,
  );
  const defaultGroupAccessPermissionValue = getSchemasPermission(
    permissions,
    defaultGroup.id,
    entityId,
    DataPermission.VIEW_DATA,
  );
  const accessPermissionWarning = getPermissionWarning(
    accessPermissionValue,
    defaultGroupAccessPermissionValue,
    "schemas",
    defaultGroup,
    groupId,
  );

  const options = PLUGIN_ADVANCED_PERMISSIONS.addDatabasePermissionOptions(
    _.compact([
      DATA_PERMISSION_OPTIONS.unrestricted,
      DATA_PERMISSION_OPTIONS.controlled,
      originalAccessPermissionValue ===
        DATA_PERMISSION_OPTIONS.noSelfServiceDeprecated.value &&
        DATA_PERMISSION_OPTIONS.noSelfServiceDeprecated,
    ]),
    database,
  );

  return {
    permission: DataPermission.VIEW_DATA,
    type: DataPermissionType.ACCESS,
    isDisabled: isAdmin || options.length <= 1,
    disabledTooltip: isAdmin ? UNABLE_TO_CHANGE_ADMIN_PERMISSIONS : null,
    isHighlighted: isAdmin,
    value: accessPermissionValue,
    warning: accessPermissionWarning,
    confirmations: accessPermissionConfirmations,
    options,
    postActions: {
      controlled: (_, __, ___, accessPermissionValue) =>
        granulateDatabasePermissions(
          groupId,
          entityId,
          {
            type: DataPermissionType.ACCESS,
            permission: DataPermission.VIEW_DATA,
          },
          accessPermissionValue,
          DATA_PERMISSION_OPTIONS.unrestricted.value,
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
): PermissionSectionConfig => {
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

  const nativePermissionConfirmations = (newValue: DataPermissionValue) => [
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
    permission: DataPermission.CREATE_QUERIES,
    type: DataPermissionType.NATIVE,
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
          {
            type: DataPermissionType.NATIVE,
            permission: DataPermission.CREATE_QUERIES,
          },
          accessPermissionValue,
          DATA_PERMISSION_OPTIONS.queryBuilder.value,
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
): PermissionSectionConfig[] => {
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
