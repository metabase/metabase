import type { ReactNode } from "react";

import {
  type DataPermission,
  DataPermissionValue,
  type DatabaseEntityId,
  type EntityId,
  type PermissionSubject,
  type SpecialGroupType,
} from "metabase/admin/permissions/types";
import { getUserIsAdmin } from "metabase/selectors/user";
import type Database from "metabase-lib/v1/metadata/Database";
import type {
  Dataset,
  Group,
  GroupPermissions,
  GroupsPermissions,
  User,
} from "metabase-types/api";
import type { State } from "metabase-types/store";

import type { PluginGroupManagersType } from "../types";

const getDefaultAdminPermissionsDatabaseRoutes = () => [];
const getDefaultAdminPermissionsDatabaseGroupRoutes = () => [];
const getDefaultAdminPermissionsDatabasePostActions = () => ({
  impersonated: null,
});
const getDefaultAdminPermissionsDatabaseActions = () => ({
  impersonated: [],
});
const getDefaultAdminPermissionsTableOptions = () => [];
const getDefaultAdminPermissionsTableRoutes = () => [];
const getDefaultAdminPermissionsTableGroupRoutes = () => [];
const getDefaultAdminPermissionsTableFieldsOptions = () => [];
const getDefaultAdminPermissionsTableFieldsConfirmations = (): Array<
  (
    _permissions: GroupsPermissions,
    _groupId: number,
    _entityId: EntityId,
    _value: DataPermissionValue,
  ) => any
> => [];
const getDefaultAdminPermissionsTableFieldsActions = () => ({
  sandboxed: [],
});
const getDefaultAdminPermissionsTableFieldsPostAction = () => ({
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
  ) => [Record<string, undefined | { group_id: string }[]>, string[]])[];
  hasChanges: ((state: State) => boolean)[];
  shouldRestrictNativeQueryPermissions: (
    permissions: GroupsPermissions,
    groupId: number,
    entityId: EntityId,
    permission: DataPermission,
    value: DataPermissionValue,
    database: Database,
  ) => boolean;

  upgradeViewPermissionsIfNeeded:
    | ((
        permissions: GroupsPermissions,
        groupId: number,
        entityId: EntityId,
        value: any,
        database: Database,
        permission: DataPermission,
      ) => GroupPermissions)
    | null;
} = getDefaultDataPermissions();

const getDefaultAdminUserMenuItems = (): Array<
  (user: User) => React.ReactNode
> => [];
const getDefaultAdminUserMenuRoutes = (): (() => React.ReactNode)[] => [];

export const PLUGIN_ADMIN_USER_MENU_ITEMS = getDefaultAdminUserMenuItems();
export const PLUGIN_ADMIN_USER_MENU_ROUTES = getDefaultAdminUserMenuRoutes();

const getDefaultAdvancedPermissions = () => ({
  addDatabasePermissionOptions: (permissions: any[], _database: Database) =>
    permissions,
  addSchemaPermissionOptions: (permissions: any[], _value: string) =>
    permissions,
  addTablePermissionOptions: (permissions: any[], _value: string) =>
    permissions,
  getDatabaseLimitedAccessPermission: (_value: string) => null,
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
  getFeatureLevelDataPermissions: (
    _entityId: DatabaseEntityId,
    _groupId: number,
    _groupType: SpecialGroupType,
    _permissions: GroupsPermissions,
    _dataAccessPermissionValue: DataPermissionValue,
    _defaultGroup: Group,
    _permissionSubject: PermissionSubject,
    _permissionView?: "group" | "database",
  ) => {
    return [] as any;
  },
  getDataColumns: (
    _subject: PermissionSubject,
    _groupType?: SpecialGroupType,
    _isExternal?: boolean,
  ) => [] as any,
  getDownloadWidgetMessageOverride: (_result: Dataset): string | null => null,
  canDownloadResults: (_result: Dataset): boolean => true,
  canAccessDataModel: (state: State): boolean => getUserIsAdmin(state),
  dataModelQueryProps: {} as any,
  databaseDetailsQueryProps: {} as any,
});

export const PLUGIN_FEATURE_LEVEL_PERMISSIONS =
  getDefaultFeatureLevelPermissions();

const getDefaultAdminPermissionsTabs = () => ({
  getRoutes: (): ReactNode => null,
  tabs: [] as { name: string; value: string }[],
});

export const PLUGIN_ADMIN_PERMISSIONS_TABS = getDefaultAdminPermissionsTabs();

const getDefaultApplicationPermissions = () => ({
  getRoutes: (): ReactNode => null,
  tabs: [] as any,
  selectors: {
    canAccessSettings: (_state: any) => false,
    canManageSubscriptions: (_state: any) => true,
  },
});

export const PLUGIN_APPLICATION_PERMISSIONS =
  getDefaultApplicationPermissions();

const getDefaultGroupManagers = (): PluginGroupManagersType => ({
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
