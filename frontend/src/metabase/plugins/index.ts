import { t } from "ttag";
import React from "react";
import PluginPlaceholder from "metabase/plugins/components/PluginPlaceholder";
import {
  DatabaseEntityId,
  PermissionSubject,
} from "metabase/admin/permissions/types";
import {
  Collection,
  Bookmark,
  GroupsPermissions,
  User,
  Dataset,
} from "metabase-types/api";
import { State } from "metabase-types/store";

// Plugin integration points. All exports must be objects or arrays so they can be mutated by plugins.
const object = () => ({});
const array = () => [];

// functions called when the application is started
export const PLUGIN_APP_INIT_FUCTIONS = [];

// function to determine the landing page
export const PLUGIN_LANDING_PAGE = [];

// override for LogoIcon
export const PLUGIN_LOGO_ICON_COMPONENTS = [];

// admin nav items and routes
export const PLUGIN_ADMIN_NAV_ITEMS = [];
export const PLUGIN_ADMIN_ROUTES = [];

// functions that update the sections
export const PLUGIN_ADMIN_SETTINGS_UPDATES = [];

// admin permissions
export const PLUGIN_ADMIN_PERMISSIONS_TABLE_ROUTES = [];
export const PLUGIN_ADMIN_PERMISSIONS_TABLE_GROUP_ROUTES = [];
export const PLUGIN_ADMIN_PERMISSIONS_TABLE_FIELDS_OPTIONS = [];
export const PLUGIN_ADMIN_PERMISSIONS_TABLE_FIELDS_ACTIONS = {
  controlled: [],
};
export const PLUGIN_ADMIN_PERMISSIONS_TABLE_FIELDS_POST_ACTION = {
  controlled: null,
};
export const PLUGIN_ADMIN_PERMISSIONS_TABLE_FIELDS_PERMISSION_VALUE = {
  controlled: null,
};

// user form fields, e.x. login attributes
export const PLUGIN_ADMIN_USER_FORM_FIELDS = [];

// menu items in people management tab
export const PLUGIN_ADMIN_USER_MENU_ITEMS = [];
export const PLUGIN_ADMIN_USER_MENU_ROUTES = [];

// authentication providers
export const PLUGIN_AUTH_PROVIDERS = [] as any;

// Only show the password tab in account settings if these functions all return true
export const PLUGIN_SHOW_CHANGE_PASSWORD_CONDITIONS = [];

// selectors that customize behavior between app versions
export const PLUGIN_SELECTORS = {
  getShowBrandLogo: (state: State) => true,
  getShowBrandScene: (state: State) => true,
  getLogoBackgroundClass: (state: State) => "bg-white",
};

export const PLUGIN_FORM_WIDGETS = {};

// snippet sidebar
export const PLUGIN_SNIPPET_SIDEBAR_PLUS_MENU_OPTIONS = [];
export const PLUGIN_SNIPPET_SIDEBAR_ROW_RENDERERS = {};
export const PLUGIN_SNIPPET_SIDEBAR_MODALS = [];
export const PLUGIN_SNIPPET_SIDEBAR_HEADER_BUTTONS = [];

export const PLUGIN_DASHBOARD_SUBSCRIPTION_PARAMETERS_SECTION_OVERRIDE = {
  Component: undefined,
};

const AUTHORITY_LEVEL_REGULAR = {
  type: null,
  name: t`Regular`,
  icon: "folder",
};

export const PLUGIN_COLLECTIONS = {
  authorityLevelFormFields: [],
  isRegularCollection: (_: Collection | Bookmark) => true,
  REGULAR_COLLECTION: AUTHORITY_LEVEL_REGULAR,
  AUTHORITY_LEVEL: {
    [JSON.stringify(AUTHORITY_LEVEL_REGULAR.type)]: AUTHORITY_LEVEL_REGULAR,
  },
};

export const PLUGIN_COLLECTION_COMPONENTS = {
  CollectionAuthorityLevelIcon: PluginPlaceholder,
};

export const PLUGIN_MODERATION = {
  QuestionModerationSection: PluginPlaceholder,
  ModerationStatusIcon: PluginPlaceholder,
  getStatusIconForQuestion: object,
  getStatusIcon: object,
  getModerationTimelineEvents: array,
};

export const PLUGIN_CACHING = {
  dashboardCacheTTLFormField: null,
  databaseCacheTTLFormField: null,
  questionCacheTTLFormField: null,
  getQuestionsImplicitCacheTTL: () => null,
};

export const PLUGIN_REDUCERS = {} as any;

export const PLUGIN_ADVANCED_PERMISSIONS = {
  addDatabasePermissionOptions: (permissions: any[]) => permissions,
  addSchemaPermissionOptions: (permissions: any[], _value: string) =>
    permissions,
  addTablePermissionOptions: (permissions: any[], _value: string) =>
    permissions,
  isBlockPermission: (_value: string) => false,
};

export const PLUGIN_FEATURE_LEVEL_PERMISSIONS = {
  canAccessSettings: (_user: User) => false,
  canAccessDataModel: (_user: User) => false,
  canAccessDatabaseManagement: (_user: User) => false,
  getFeatureLevelDataPermissions: (
    _entityId: DatabaseEntityId,
    _groupId: number,
    _isAdmin: boolean,
    _permissions: GroupsPermissions,
    _dataAccessPermissionValue: string,
    _permissionSubject: PermissionSubject,
  ) => {
    return [] as any;
  },
  dataColumns: [] as any,
  getDownloadWidgetMessageOverride: (_result: Dataset): string | null => null,
  canDownloadResults: (_result: Dataset): boolean => true,
};

export const PLUGIN_GENERAL_PERMISSIONS = {
  getRoutes: (): React.ReactNode => null,
  tabs: [] as any,
  selectors: {
    canManageSubscriptions: (_state: any) => true,
  },
};
