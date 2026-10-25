import type { ReactElement, ReactNode } from "react";

import type { ColorName } from "metabase/ui/colors/types";
import type {
  DataPermission,
  DataPermissionType,
  Database,
  Dataset,
  GroupId,
  GroupInfo,
  GroupTableAccessPolicy,
  GroupsPermissions,
  IconName,
  Impersonation,
  User,
} from "metabase-types/api";
import { DataPermissionValue } from "metabase-types/api";

import { definePluginSlot } from "../slot";
import type { PluginGroupManagersType } from "../types";

type DataModelQueryProps = {
  include_editable_data_model?: boolean;
};

const DEFAULT_DATA_MODEL_QUERY_PROPS: DataModelQueryProps = {};

export type DatabaseEntityId = {
  databaseId: number;
};

export type SchemaEntityId = DatabaseEntityId & {
  schemaName: string | undefined;
};

export type TableEntityId = SchemaEntityId & {
  tableId: number;
};

export type PermissionEntityId = DatabaseEntityId &
  Partial<Omit<TableEntityId, "databaseId">>;

export type EntityWithGroupId = PermissionEntityId & { groupId: number };

export type PermissionsDatabase = Database;

export type PermissionSubject = "schemas" | "tables" | "fields";

export type SpecialGroupType = "admin" | "analyst" | "external" | null;

export type DataPermissionView = "database" | "group";

export type DataPermissionUpdate = {
  groupId: GroupId;
  entityId: PermissionEntityId;
  type: DataPermissionType;
  permission: DataPermission;
  value: DataPermissionValue;
};

export type AppliedDataPermissionUpdate = DataPermissionUpdate & {
  database: PermissionsDatabase;
};

export type DataPermissionsDrafts = {
  sandboxes: Record<string, GroupTableAccessPolicy>;
  impersonations: Impersonation[];
};

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
  onSelect: (
    entityId: PermissionEntityId | undefined,
    groupId: GroupId,
    view: DataPermissionView,
  ) => void;
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
  view: DataPermissionView,
  applyUpdate: (update: DataPermissionUpdate) => void,
) => void;

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

export const PLUGIN_ADMIN_PERMISSIONS_DATABASE_ROUTES = definePluginSlot(
  getDefaultAdminPermissionsDatabaseRoutes,
);
export const PLUGIN_ADMIN_PERMISSIONS_DATABASE_GROUP_ROUTES = definePluginSlot(
  getDefaultAdminPermissionsDatabaseGroupRoutes,
);
export const PLUGIN_ADMIN_PERMISSIONS_DATABASE_POST_ACTIONS = definePluginSlot(
  getDefaultAdminPermissionsDatabasePostActions,
);
export const PLUGIN_ADMIN_PERMISSIONS_DATABASE_ACTIONS = definePluginSlot(
  getDefaultAdminPermissionsDatabaseActions,
);
export const PLUGIN_ADMIN_PERMISSIONS_TABLE_OPTIONS = definePluginSlot(
  getDefaultAdminPermissionsTableOptions,
);
export const PLUGIN_ADMIN_PERMISSIONS_TABLE_ROUTES = definePluginSlot(
  getDefaultAdminPermissionsTableRoutes,
);
export const PLUGIN_ADMIN_PERMISSIONS_TABLE_GROUP_ROUTES = definePluginSlot(
  getDefaultAdminPermissionsTableGroupRoutes,
);
export const PLUGIN_ADMIN_PERMISSIONS_TABLE_FIELDS_OPTIONS = definePluginSlot(
  getDefaultAdminPermissionsTableFieldsOptions,
);
export const PLUGIN_ADMIN_PERMISSIONS_TABLE_FIELDS_CONFIRMATIONS =
  definePluginSlot(getDefaultAdminPermissionsTableFieldsConfirmations);
export const PLUGIN_ADMIN_PERMISSIONS_TABLE_FIELDS_ACTIONS = definePluginSlot(
  getDefaultAdminPermissionsTableFieldsActions,
);
export const PLUGIN_ADMIN_PERMISSIONS_TABLE_FIELDS_POST_ACTION =
  definePluginSlot(getDefaultAdminPermissionsTableFieldsPostAction);

const getDefaultDataPermissions = () => ({
  pruneDrafts: [],
  upgradeViewPermissionsIfNeeded: null,
  shouldRestrictNativeQueryPermissions: () => false,
});

export const PLUGIN_DATA_PERMISSIONS: {
  pruneDrafts: ((
    drafts: DataPermissionsDrafts,
    update: AppliedDataPermissionUpdate,
  ) => DataPermissionsDrafts)[];
  shouldRestrictNativeQueryPermissions: (
    permissions: GroupsPermissions,
    groupId: number,
    entityId: PermissionEntityId,
    permission: DataPermission,
    value: DataPermissionValue,
    database: PermissionsDatabase,
  ) => boolean;

  upgradeViewPermissionsIfNeeded:
    | ((
        permissions: GroupsPermissions,
        groupId: number,
        entityId: PermissionEntityId,
        value: DataPermissionValue,
        database: PermissionsDatabase,
        permission: DataPermission,
      ) => GroupsPermissions)
    | null;
} = definePluginSlot(getDefaultDataPermissions);

const getDefaultAdminUserMenuItems = (): Array<
  (user: User) => React.ReactNode
> => [];
const getDefaultAdminUserMenuRoutes = (): (() => React.ReactNode)[] => [];

export const PLUGIN_ADMIN_USER_MENU_ITEMS = definePluginSlot(
  getDefaultAdminUserMenuItems,
);
export const PLUGIN_ADMIN_USER_MENU_ROUTES = definePluginSlot(
  getDefaultAdminUserMenuRoutes,
);

const getDefaultAdvancedPermissions = () => ({
  addDatabasePermissionOptions: (
    permissions: PermissionOption[],
    _database: PermissionsDatabase,
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

export const PLUGIN_ADVANCED_PERMISSIONS = definePluginSlot(
  getDefaultAdvancedPermissions,
);

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
    defaultGroup: GroupInfo;
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
  dataModelQueryProps: DEFAULT_DATA_MODEL_QUERY_PROPS,
  // Unjustified type cast. FIXME
  databaseDetailsQueryProps: {} as any,
});

export const PLUGIN_FEATURE_LEVEL_PERMISSIONS = definePluginSlot(
  getDefaultFeatureLevelPermissions,
);

const getDefaultAdminPermissionsTabs = () => ({
  getRoutes: (): ReactNode => null,
  // Unjustified type cast. FIXME
  tabs: [] as { name: string; value: string }[],
});

export const PLUGIN_ADMIN_PERMISSIONS_TABS = definePluginSlot(
  getDefaultAdminPermissionsTabs,
);

const getDefaultApplicationPermissions = () => ({
  getRoutes: (): ReactNode => null,
  // Unjustified type cast. FIXME
  tabs: [] as any,
});

export const PLUGIN_APPLICATION_PERMISSIONS = definePluginSlot(
  getDefaultApplicationPermissions,
);

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

export const PLUGIN_GROUP_MANAGERS = definePluginSlot(getDefaultGroupManagers);
