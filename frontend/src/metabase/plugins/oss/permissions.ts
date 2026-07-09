import type { Action, ThunkDispatch } from "@reduxjs/toolkit";
import type { ReactElement, ReactNode } from "react";

import type { State } from "metabase/redux/store";
import { getUserIsAdmin } from "metabase/selectors/user";
import type { ColorName } from "metabase/ui/colors/types";
import type Database from "metabase-lib/v1/metadata/Database";
import type {
  DataPermission,
  DatabaseEntityId,
  Dataset,
  Group,
  GroupId,
  GroupsPermissions,
  IconName,
  PermissionEntityId,
  PermissionSubject,
  SpecialGroupType,
  User,
} from "metabase-types/api";
import { DataPermissionValue } from "metabase-types/api";

import type { PluginGroupManagersType } from "../types";

// These describe the entries EE plugins contribute to the admin permissions
// editor. They live here (not in metabase/admin) because shared plugin code
// cannot import from feature modules; metabase/admin/permissions/types
// re-exports them.
export interface PermissionOption {
  label: string;
  value: DataPermissionValue;
  icon: IconName;
  iconColor: ColorName;
}

export interface PermissionAction {
  label: string;
  icon: IconName;
  iconColor: ColorName;
  actionCreator: (
    entityId: PermissionEntityId | undefined,
    groupId: GroupId,
    view: "database" | "group",
  ) => Action;
}

export interface PermissionConfirmationProps {
  title: string;
  message: ReactNode;
  confirmButtonText: string;
  cancelButtonText: string;
}

export type PostActionFunction = (
  entityId: PermissionEntityId,
  groupId: GroupId,
  view: "database" | "group",
  value: DataPermissionValue,
  getState: () => State,
) =>
  | Action
  | ((
      dispatch: ThunkDispatch<State, unknown, Action>,
      getState: () => State,
    ) => unknown)
  | void;

const getDefaultAdminPermissionsDatabaseRoutes = (): ReactElement[] => [];
const getDefaultAdminPermissionsDatabaseGroupRoutes = (): ReactElement[] => [];
const getDefaultAdminPermissionsDatabasePostActions = (): {
  impersonated: PostActionFunction | null;
} => ({
  impersonated: null,
});
const getDefaultAdminPermissionsDatabaseActions = (): {
  impersonated: PermissionAction[];
} => ({
  impersonated: [],
});
const getDefaultAdminPermissionsTableOptions = (): PermissionOption[] => [];
const getDefaultAdminPermissionsTableRoutes = (): ReactElement[] => [];
const getDefaultAdminPermissionsTableGroupRoutes = (): ReactElement[] => [];
const getDefaultAdminPermissionsTableFieldsOptions =
  (): PermissionOption[] => [];
const getDefaultAdminPermissionsTableFieldsConfirmations = (): Array<
  (
    _permissions: GroupsPermissions,
    _groupId: number,
    _entityId: PermissionEntityId,
    _value: DataPermissionValue,
  ) => PermissionConfirmationProps | undefined
> => [];
const getDefaultAdminPermissionsTableFieldsActions = (): {
  sandboxed: PermissionAction[];
} => ({
  sandboxed: [],
});
const getDefaultAdminPermissionsTableFieldsPostAction = (): {
  sandboxed: PostActionFunction | null;
} => ({
  sandboxed: null,
});

export const PLUGIN_ADMIN_PERMISSIONS_DATABASE_ROUTES =
  getDefaultAdminPermissionsDatabaseRoutes();
export const PLUGIN_ADMIN_PERMISSIONS_DATABASE_GROUP_ROUTES =
  getDefaultAdminPermissionsDatabaseGroupRoutes();
export const PLUGIN_ADMIN_PERMISSIONS_DATABASE_POST_ACTIONS =
  getDefaultAdminPermissionsDatabasePostActions();
export const PLUGIN_ADMIN_PERMISSIONS_DATABASE_ACTIONS =
  getDefaultAdminPermissionsDatabaseActions();
export const PLUGIN_ADMIN_PERMISSIONS_TABLE_OPTIONS =
  getDefaultAdminPermissionsTableOptions();
export const PLUGIN_ADMIN_PERMISSIONS_TABLE_ROUTES =
  getDefaultAdminPermissionsTableRoutes();
export const PLUGIN_ADMIN_PERMISSIONS_TABLE_GROUP_ROUTES =
  getDefaultAdminPermissionsTableGroupRoutes();
export const PLUGIN_ADMIN_PERMISSIONS_TABLE_FIELDS_OPTIONS =
  getDefaultAdminPermissionsTableFieldsOptions();
export const PLUGIN_ADMIN_PERMISSIONS_TABLE_FIELDS_CONFIRMATIONS =
  getDefaultAdminPermissionsTableFieldsConfirmations();
export const PLUGIN_ADMIN_PERMISSIONS_TABLE_FIELDS_ACTIONS =
  getDefaultAdminPermissionsTableFieldsActions();
export const PLUGIN_ADMIN_PERMISSIONS_TABLE_FIELDS_POST_ACTION =
  getDefaultAdminPermissionsTableFieldsPostAction();

const getDefaultDataPermissions = () => ({
  permissionsPayloadExtraSelectors: [],
  hasChanges: [],
  upgradeViewPermissionsIfNeeded: null,
  shouldRestrictNativeQueryPermissions: () => false,
});

export const PLUGIN_DATA_PERMISSIONS: {
  permissionsPayloadExtraSelectors: ((
    state: State,
  ) => [Record<string, undefined | { group_id: number }[]>, string[]])[];
  hasChanges: ((state: State) => boolean)[];
  shouldRestrictNativeQueryPermissions: (
    permissions: GroupsPermissions,
    groupId: number,
    entityId: PermissionEntityId,
    permission: DataPermission,
    value: DataPermissionValue,
    database: Database,
  ) => boolean;

  upgradeViewPermissionsIfNeeded:
    | ((
        permissions: GroupsPermissions,
        groupId: number,
        entityId: PermissionEntityId,
        value: DataPermissionValue,
        database: Database,
        permission: DataPermission,
      ) => GroupsPermissions)
    | null;
} = getDefaultDataPermissions();

const getDefaultAdminUserMenuItems = (): Array<
  (user: User) => React.ReactNode
> => [];
const getDefaultAdminUserMenuRoutes = (): (() => React.ReactNode)[] => [];

export const PLUGIN_ADMIN_USER_MENU_ITEMS = getDefaultAdminUserMenuItems();
export const PLUGIN_ADMIN_USER_MENU_ROUTES = getDefaultAdminUserMenuRoutes();

const getDefaultAdvancedPermissions = () => ({
  addDatabasePermissionOptions: (
    permissions: PermissionOption[],
    _database: Database,
  ) => permissions,
  addSchemaPermissionOptions: (
    permissions: PermissionOption[],
    _value: string,
  ) => permissions,
  addTablePermissionOptions: (
    permissions: PermissionOption[],
    _value: string,
  ) => permissions,
  getDatabaseLimitedAccessPermission: (
    _value: string,
  ): DataPermissionValue | null => null,
  isAccessPermissionDisabled: (
    _value: string,
    _subject: "schemas" | "tables" | "fields",
  ) => false,
  isRestrictivePermission: (_value: string) => false,
  shouldShowViewDataColumn: false,
  defaultViewDataPermission: DataPermissionValue.UNRESTRICTED,
});

export const PLUGIN_ADVANCED_PERMISSIONS = getDefaultAdvancedPermissions();

const getDefaultFeatureLevelPermissions = () => ({
  getFeatureLevelDataPermissions: ({
    entityId: _entityId,
    groupId: _groupId,
    groupType: _groupType,
    permissions: _permissions,
    dataAccessPermissionValue: _dataAccessPermissionValue,
    defaultGroup: _defaultGroup,
    permissionSubject: _permissionSubject,
    permissionView: _permissionView,
    showTransformPermissions: _showTransformPermissions,
  }: {
    entityId: DatabaseEntityId;
    groupId: number;
    groupType: SpecialGroupType;
    permissions: GroupsPermissions;
    dataAccessPermissionValue: DataPermissionValue;
    defaultGroup: Group;
    permissionSubject: PermissionSubject;
    permissionView?: "group" | "database";
    showTransformPermissions?: boolean;
  }) => {
    // Unjustified type cast. FIXME
    return [] as any;
  },
  getDataColumns: ({
    subject: _subject,
    groupType: _groupType,
    isExternal: _isExternal,
    showTransformPermissions: _showTransformPermissions,
  }: {
    subject: PermissionSubject;
    groupType?: SpecialGroupType;
    isExternal?: boolean;
    showTransformPermissions?: boolean;
    // Unjustified type cast. FIXME
  }) => [] as any,
  getDownloadWidgetMessageOverride: (_result: Dataset): string | null => null,
  canDownloadResults: (_result: Dataset): boolean => true,
  canAccessDataModel: (state: State): boolean => getUserIsAdmin(state),
  // Unjustified type cast. FIXME
  dataModelQueryProps: {} as any,
  // Unjustified type cast. FIXME
  databaseDetailsQueryProps: {} as any,
});

export const PLUGIN_FEATURE_LEVEL_PERMISSIONS =
  getDefaultFeatureLevelPermissions();

const getDefaultAdminPermissionsTabs = () => ({
  getRoutes: (): ReactNode => null,
  // Unjustified type cast. FIXME
  tabs: [] as { name: string; value: string }[],
});

export const PLUGIN_ADMIN_PERMISSIONS_TABS = getDefaultAdminPermissionsTabs();

const getDefaultApplicationPermissions = () => ({
  getRoutes: (): ReactNode => null,
  // Unjustified type cast. FIXME
  tabs: [] as any,
  selectors: {
    canAccessSettings: (_state: any) => false,
    canManageSubscriptions: (_state: any) => true,
  },
});

export const PLUGIN_APPLICATION_PERMISSIONS =
  getDefaultApplicationPermissions();

const getDefaultGroupManagers = (): PluginGroupManagersType => ({
  // Unjustified type cast. FIXME
  UserTypeToggle: () => null as any,
  UserTypeCell: null,

  getChangeMembershipConfirmation: () => null,
  getRemoveMembershipConfirmation: () => null,

  deleteGroup: null,
  confirmDeleteMembershipAction: null,
  confirmUpdateMembershipAction: null,
});

export const PLUGIN_GROUP_MANAGERS = getDefaultGroupManagers();

/**
 * @internal Do not call directly. Use the main reinitialize function from metabase/plugins instead.
 */
export function reinitialize() {
  PLUGIN_ADMIN_PERMISSIONS_DATABASE_ROUTES.length = 0;
  PLUGIN_ADMIN_PERMISSIONS_DATABASE_ROUTES.push(
    ...getDefaultAdminPermissionsDatabaseRoutes(),
  );

  PLUGIN_ADMIN_PERMISSIONS_DATABASE_GROUP_ROUTES.length = 0;
  PLUGIN_ADMIN_PERMISSIONS_DATABASE_GROUP_ROUTES.push(
    ...getDefaultAdminPermissionsDatabaseGroupRoutes(),
  );

  Object.assign(
    PLUGIN_ADMIN_PERMISSIONS_DATABASE_POST_ACTIONS,
    getDefaultAdminPermissionsDatabasePostActions(),
  );
  Object.assign(
    PLUGIN_ADMIN_PERMISSIONS_DATABASE_ACTIONS,
    getDefaultAdminPermissionsDatabaseActions(),
  );

  PLUGIN_ADMIN_PERMISSIONS_TABLE_OPTIONS.length = 0;
  PLUGIN_ADMIN_PERMISSIONS_TABLE_OPTIONS.push(
    ...getDefaultAdminPermissionsTableOptions(),
  );

  PLUGIN_ADMIN_PERMISSIONS_TABLE_ROUTES.length = 0;
  PLUGIN_ADMIN_PERMISSIONS_TABLE_ROUTES.push(
    ...getDefaultAdminPermissionsTableRoutes(),
  );

  PLUGIN_ADMIN_PERMISSIONS_TABLE_GROUP_ROUTES.length = 0;
  PLUGIN_ADMIN_PERMISSIONS_TABLE_GROUP_ROUTES.push(
    ...getDefaultAdminPermissionsTableGroupRoutes(),
  );

  PLUGIN_ADMIN_PERMISSIONS_TABLE_FIELDS_OPTIONS.length = 0;
  PLUGIN_ADMIN_PERMISSIONS_TABLE_FIELDS_OPTIONS.push(
    ...getDefaultAdminPermissionsTableFieldsOptions(),
  );

  PLUGIN_ADMIN_PERMISSIONS_TABLE_FIELDS_CONFIRMATIONS.length = 0;
  PLUGIN_ADMIN_PERMISSIONS_TABLE_FIELDS_CONFIRMATIONS.push(
    ...getDefaultAdminPermissionsTableFieldsConfirmations(),
  );

  Object.assign(
    PLUGIN_ADMIN_PERMISSIONS_TABLE_FIELDS_ACTIONS,
    getDefaultAdminPermissionsTableFieldsActions(),
  );
  Object.assign(
    PLUGIN_ADMIN_PERMISSIONS_TABLE_FIELDS_POST_ACTION,
    getDefaultAdminPermissionsTableFieldsPostAction(),
  );

  Object.assign(PLUGIN_DATA_PERMISSIONS, getDefaultDataPermissions());

  PLUGIN_ADMIN_USER_MENU_ITEMS.length = 0;
  PLUGIN_ADMIN_USER_MENU_ITEMS.push(...getDefaultAdminUserMenuItems());

  PLUGIN_ADMIN_USER_MENU_ROUTES.length = 0;
  PLUGIN_ADMIN_USER_MENU_ROUTES.push(...getDefaultAdminUserMenuRoutes());

  Object.assign(PLUGIN_ADVANCED_PERMISSIONS, getDefaultAdvancedPermissions());
  Object.assign(
    PLUGIN_FEATURE_LEVEL_PERMISSIONS,
    getDefaultFeatureLevelPermissions(),
  );

  Object.assign(
    PLUGIN_ADMIN_PERMISSIONS_TABS,
    getDefaultAdminPermissionsTabs(),
  );

  Object.assign(
    PLUGIN_APPLICATION_PERMISSIONS,
    getDefaultApplicationPermissions(),
  );
  Object.assign(PLUGIN_GROUP_MANAGERS, getDefaultGroupManagers());
}
