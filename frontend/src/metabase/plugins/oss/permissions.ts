import type { ReactNode } from "react";

import {
  type DataPermission,
  DataPermissionValue,
  type DatabaseEntityId,
  type EntityId,
  type PermissionSubject,
} from "metabase/admin/permissions/types";
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

export const PLUGIN_ADMIN_PERMISSIONS_DATABASE_ROUTES = [];
export const PLUGIN_ADMIN_PERMISSIONS_DATABASE_GROUP_ROUTES = [];
export const PLUGIN_ADMIN_PERMISSIONS_DATABASE_POST_ACTIONS = {
  impersonated: null,
};
export const PLUGIN_ADMIN_PERMISSIONS_DATABASE_ACTIONS = {
  impersonated: [],
};

export const PLUGIN_ADMIN_PERMISSIONS_TABLE_OPTIONS = [];

export const PLUGIN_ADMIN_PERMISSIONS_TABLE_ROUTES = [];
export const PLUGIN_ADMIN_PERMISSIONS_TABLE_GROUP_ROUTES = [];
export const PLUGIN_ADMIN_PERMISSIONS_TABLE_FIELDS_OPTIONS = [];
export const PLUGIN_ADMIN_PERMISSIONS_TABLE_FIELDS_CONFIRMATIONS = [] as Array<
  (
    _permissions: GroupsPermissions,
    _groupId: number,
    _entityId: EntityId,
    _value: DataPermissionValue,
  ) => any
>;
export const PLUGIN_ADMIN_PERMISSIONS_TABLE_FIELDS_ACTIONS = {
  sandboxed: [],
};
export const PLUGIN_ADMIN_PERMISSIONS_TABLE_FIELDS_POST_ACTION = {
  sandboxed: null,
};

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
} = {
  permissionsPayloadExtraSelectors: [],
  hasChanges: [],
  upgradeViewPermissionsIfNeeded: null,
  shouldRestrictNativeQueryPermissions: () => false,
};

export const PLUGIN_ADMIN_USER_MENU_ITEMS = [] as Array<
  (user: User) => React.ReactNode
>;
export const PLUGIN_ADMIN_USER_MENU_ROUTES = [];

export const PLUGIN_ADVANCED_PERMISSIONS = {
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
};

export const PLUGIN_FEATURE_LEVEL_PERMISSIONS = {
  getFeatureLevelDataPermissions: (
    _entityId: DatabaseEntityId,
    _groupId: number,
    _isAdmin: boolean,
    _permissions: GroupsPermissions,
    _dataAccessPermissionValue: DataPermissionValue,
    _defaultGroup: Group,
    _permissionSubject: PermissionSubject,
  ) => {
    return [] as any;
  },
  getDataColumns: (_subject: PermissionSubject) => [] as any,
  getDownloadWidgetMessageOverride: (_result: Dataset): string | null => null,
  canDownloadResults: (_result: Dataset): boolean => true,
  dataModelQueryProps: {} as any,
  databaseDetailsQueryProps: {} as any,
};

export const PLUGIN_APPLICATION_PERMISSIONS = {
  getRoutes: (): ReactNode => null,
  tabs: [] as any,
  selectors: {
    canAccessSettings: (_state: any) => false,
    canManageSubscriptions: (_state: any) => true,
  },
};

export interface UserWithApplicationPermissions extends User {
  permissions?: {
    can_access_monitoring: boolean;
    can_access_setting: boolean;
    can_access_subscription: boolean;
  };
}

export const PLUGIN_GROUP_MANAGERS: PluginGroupManagersType = {
  UserTypeToggle: () => null as any,
  UserTypeCell: null,

  getChangeMembershipConfirmation: () => null,
  getRemoveMembershipConfirmation: () => null,

  deleteGroup: null,
  confirmDeleteMembershipAction: null,
  confirmUpdateMembershipAction: null,
};
