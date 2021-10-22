import { t } from "ttag";

import PluginPlaceholder from "metabase/plugins/components/PluginPlaceholder";

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
export const PLUGIN_AUTH_PROVIDERS = [];

// Only show the password tab in account settings if these functions all return true
export const PLUGIN_SHOW_CHANGE_PASSWORD_CONDITIONS = [];

// selectors that customize behavior between app versions
export const PLUGIN_SELECTORS = {
  getShowAuthScene: (state, props) => true,
  getLogoBackgroundClass: (state, props) => "bg-white",
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
  isRegularCollection: () => true,
  REGULAR_COLLECTION: AUTHORITY_LEVEL_REGULAR,
  AUTHORITY_LEVEL: {
    [AUTHORITY_LEVEL_REGULAR.type]: AUTHORITY_LEVEL_REGULAR,
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

export const PLUGIN_ADVANCED_PERMISSIONS = {
  DataPermissionsHelp: null,
  addDatabasePermissionOptions: (permissions, _value) => permissions,
  addSchemaPermissionOptions: (permissions, _value) => permissions,
  addTablePermissionOptions: (permissions, _value) => permissions,
  isBlockPermission: _value => false,
};
