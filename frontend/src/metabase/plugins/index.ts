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
  Dataset,
  Group,
} from "metabase-types/api";
import { AdminPathKey, State } from "metabase-types/store";
import { User } from "metabase-types/types/User";
import { PluginGroupManagersType } from "./types";
import Question from "metabase-lib/lib/Question";

// Plugin integration points. All exports must be objects or arrays so they can be mutated by plugins.
const object = () => ({});
const array = () => [];

// functions called when the application is started
export const PLUGIN_APP_INIT_FUCTIONS = [];

// function to determine the landing page
export const PLUGIN_LANDING_PAGE = [];

export const PLUGIN_REDUX_MIDDLEWARES = [];

// override for LogoIcon
export const PLUGIN_LOGO_ICON_COMPONENTS = [];

// admin nav items and routes
export const PLUGIN_ADMIN_NAV_ITEMS = [];
export const PLUGIN_ADMIN_ROUTES = [];
export const PLUGIN_ADMIN_ALLOWED_PATH_GETTERS: ((
  user: any,
) => AdminPathKey[])[] = [];

export const PLUGIN_ADMIN_TOOLS = {
  INDEX_ROUTE: "model-caching",
  EXTRA_ROUTES_INFO: [],
  EXTRA_ROUTES: [],
};

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

// Only show the password tab in account settings if these functions all return true.
// Otherwise, the user is logged in via SSO and should hide first name, last name, and email field in profile settings metabase#23298.
export const PLUGIN_IS_PASSWORD_USER: ((user: User) => boolean)[] = [];

// selectors that customize behavior between app versions
export const PLUGIN_SELECTORS = {
  getHasCustomColors: (state: State) => false,
  canWhitelabel: (state: State) => false,
  getLoadingMessage: (state: State) => t`Doing science...`,
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
  AUTHORITY_LEVEL: {
    [JSON.stringify(AUTHORITY_LEVEL_REGULAR.type)]: AUTHORITY_LEVEL_REGULAR,
  },
  REGULAR_COLLECTION: AUTHORITY_LEVEL_REGULAR,
  isRegularCollection: (_: Collection | Bookmark) => true,
  getAuthorityLevelFormFields: () => [],
  getAuthorityLevelMenuItems: (
    _collection: Collection,
    _onUpdate: (collection: Collection, values: Partial<Collection>) => void,
  ) => [],
};

export const PLUGIN_COLLECTION_COMPONENTS = {
  CollectionAuthorityLevelIcon: PluginPlaceholder,
};

export const PLUGIN_MODERATION = {
  isEnabled: () => false,
  QuestionModerationIcon: PluginPlaceholder,
  QuestionModerationSection: PluginPlaceholder,
  QuestionModerationButton: PluginPlaceholder,
  ModerationReviewBanner: PluginPlaceholder,
  ModerationStatusIcon: PluginPlaceholder,
  getStatusIcon: object,
  getModerationTimelineEvents: array,
  getMenuItems: (
    question?: Question,
    isModerator?: boolean,
    reload?: () => void,
  ) => ({}),
};

export const PLUGIN_CACHING = {
  dashboardCacheTTLFormField: null,
  databaseCacheTTLFormField: null,
  questionCacheTTLFormField: null,
  getQuestionsImplicitCacheTTL: (question?: any) => null,
  QuestionCacheSection: PluginPlaceholder,
  DashboardCacheSection: PluginPlaceholder,
  isEnabled: () => false,
};

export const PLUGIN_REDUCERS: { applicationPermissionsPlugin: any } = {
  applicationPermissionsPlugin: () => null,
};

export const PLUGIN_ADVANCED_PERMISSIONS = {
  addDatabasePermissionOptions: (permissions: any[]) => permissions,
  addSchemaPermissionOptions: (permissions: any[], _value: string) =>
    permissions,
  addTablePermissionOptions: (permissions: any[], _value: string) =>
    permissions,
  isBlockPermission: (_value: string) => false,
};

export const PLUGIN_FEATURE_LEVEL_PERMISSIONS = {
  getFeatureLevelDataPermissions: (
    _entityId: DatabaseEntityId,
    _groupId: number,
    _isAdmin: boolean,
    _permissions: GroupsPermissions,
    _dataAccessPermissionValue: string,
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
  getRoutes: (): React.ReactNode => null,
  tabs: [] as any,
  selectors: {
    canManageSubscriptions: (_state: any) => true,
  },
};

export const PLUGIN_GROUP_MANAGERS: PluginGroupManagersType = {
  UserTypeToggle: () => null as any,
  UserTypeCell: null,

  getChangeMembershipConfirmation: () => null,
  getRemoveMembershipConfirmation: () => null,

  deleteGroup: null,
  confirmDeleteMembershipAction: null,
  confirmUpdateMembershipAction: null,
};

export const PLUGIN_MODEL_PERSISTENCE = {
  isModelLevelPersistenceEnabled: () => false,
  ModelCacheControl: PluginPlaceholder as any,
  getMenuItems: (question?: any, onChange?: any) => ({}),
};
