// Plugin integration points. All exports must be objects or arrays so they can be mutated by plugins.

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

// admin permissions grid
export const PLUGIN_ADMIN_PERMISSIONS_TABLE_ROUTES = [];
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

// authentication providers
export const PLUGIN_AUTH_PROVIDERS = [];

// Only show the password tab in account settings if these functions all return true
export const PLUGIN_SHOW_CHANGE_PASSWORD_CONDITIONS = [];

export const PLUGIN_DRILLS = [];
// additional settings that are spread into chart settings
export const PLUGIN_CHART_SETTINGS = {};

// List of functions that return columns settings for a column.
// They override existing column settings for that column.
export const PLUGIN_TABLE_COLUMN_SETTINGS = [];

// These functions are used in the formatting code. They're not automatically
// connected anywhere. Instead, they should be called directly with
// `PLUGIN_FORMATTING_HELPERS.name(value, options)`.
export const PLUGIN_FORMATTING_HELPERS = {
  url: (value, options) => String(value),
  urlText: (value, options) =>
    options.link_text || PLUGIN_FORMATTING_HELPERS.url(value, options),
};

// selectors that customize behavior between app versions
export const PLUGIN_SELECTORS = {
  getShowAuthScene: (state, props) => true,
  getLogoBackgroundClass: (state, props) => "bg-white",
};

// snippet sidebar
export const PLUGIN_SNIPPET_SIDEBAR_PLUS_MENU_OPTIONS = [];
export const PLUGIN_SNIPPET_SIDEBAR_ROW_RENDERERS = {};
export const PLUGIN_SNIPPET_SIDEBAR_MODALS = [];
export const PLUGIN_SNIPPET_SIDEBAR_HEADER_BUTTONS = [];
