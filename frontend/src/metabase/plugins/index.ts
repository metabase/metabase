import type { ComponentType, HTMLAttributes, ReactNode } from "react";
import { t } from "ttag";

import type { IconName, IconProps } from "metabase/core/components/Icon";
import PluginPlaceholder from "metabase/plugins/components/PluginPlaceholder";

import type {
  DataPermission,
  DatabaseEntityId,
  PermissionSubject,
} from "metabase/admin/permissions/types";

import type {
  Bookmark,
  Collection,
  CollectionAuthorityLevelConfig,
  Dataset,
  Group,
  GroupPermissions,
  GroupsPermissions,
  Revision,
  SearchResult,
  User,
  UserListResult,
} from "metabase-types/api";
import type { AdminPathKey, State } from "metabase-types/store";
import type { ADMIN_SETTINGS_SECTIONS } from "metabase/admin/settings/selectors";
import type { SearchFilterComponent } from "metabase/search/types";
import type Question from "metabase-lib/Question";

import type Database from "metabase-lib/metadata/Database";
import type { GetAuthProviders, PluginGroupManagersType } from "./types";

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
export const PLUGIN_ADMIN_SETTINGS_UPDATES: ((
  sections: typeof ADMIN_SETTINGS_SECTIONS,
) => void)[] = [];

// admin permissions
export const PLUGIN_ADMIN_PERMISSIONS_DATABASE_ROUTES = [];
export const PLUGIN_ADMIN_PERMISSIONS_DATABASE_GROUP_ROUTES = [];
export const PLUGIN_ADMIN_PERMISSIONS_DATABASE_POST_ACTIONS = {
  impersonated: null,
};
export const PLUGIN_ADMIN_PERMISSIONS_DATABASE_ACTIONS = {
  impersonated: [],
};

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

export const PLUGIN_DATA_PERMISSIONS: {
  permissionsPayloadExtraSelectors: ((
    state: State,
  ) => Record<string, unknown>)[];
  hasChanges: ((state: State) => boolean)[];
  updateNativePermission:
    | ((
        permissions: GroupsPermissions,
        groupId: number,
        { databaseId }: DatabaseEntityId,
        value: any,
        database: Database,
        permission: DataPermission,
      ) => GroupPermissions)
    | null;
} = {
  permissionsPayloadExtraSelectors: [],
  hasChanges: [],
  updateNativePermission: null,
};

// user form fields, e.x. login attributes
export const PLUGIN_ADMIN_USER_FORM_FIELDS = [];

// menu items in people management tab
export const PLUGIN_ADMIN_USER_MENU_ITEMS = [];
export const PLUGIN_ADMIN_USER_MENU_ROUTES = [];

// authentication providers
export const PLUGIN_AUTH_PROVIDERS: GetAuthProviders[] = [];

// Only show the password tab in account settings if these functions all return true.
// Otherwise, the user is logged in via SSO and should hide first name, last name, and email field in profile settings metabase#23298.
export const PLUGIN_IS_PASSWORD_USER: ((user: User) => boolean)[] = [];

// selectors that customize behavior between app versions
export const PLUGIN_SELECTORS = {
  canWhitelabel: (_state: State) => false,
  getLoadingMessage: (_state: State) => t`Doing science...`,
  getIsWhiteLabeling: (_state: State) => false,
};

export const PLUGIN_FORM_WIDGETS: Record<string, ComponentType<any>> = {};

// snippet sidebar
export const PLUGIN_SNIPPET_SIDEBAR_PLUS_MENU_OPTIONS = [];
export const PLUGIN_SNIPPET_SIDEBAR_ROW_RENDERERS = {};
export const PLUGIN_SNIPPET_SIDEBAR_MODALS = [];
export const PLUGIN_SNIPPET_SIDEBAR_HEADER_BUTTONS = [];

export const PLUGIN_DASHBOARD_SUBSCRIPTION_PARAMETERS_SECTION_OVERRIDE = {
  Component: undefined,
};

const AUTHORITY_LEVEL_REGULAR: CollectionAuthorityLevelConfig = {
  type: null,
  name: t`Regular`,
  icon: "folder",
};

type AuthorityLevelMenuItem = {
  title: string;
  icon: string;
  action: () => void;
};

export const PLUGIN_COLLECTIONS = {
  AUTHORITY_LEVEL: {
    [JSON.stringify(AUTHORITY_LEVEL_REGULAR.type)]: AUTHORITY_LEVEL_REGULAR,
  },
  REGULAR_COLLECTION: AUTHORITY_LEVEL_REGULAR,
  isRegularCollection: (_: Partial<Collection> | Bookmark) => true,
  getAuthorityLevelMenuItems: (
    _collection: Collection,
    _onUpdate: (collection: Collection, values: Partial<Collection>) => void,
  ): AuthorityLevelMenuItem[] => [],
};

type CollectionAuthorityLevelIcon = ComponentType<
  Omit<IconProps, "name" | "tooltip"> & {
    collection: SearchResult["collection"];
  }
>;

type FormCollectionAuthorityLevelPicker = ComponentType<
  HTMLAttributes<HTMLDivElement> & { name: string; title?: string }
>;

export const PLUGIN_COLLECTION_COMPONENTS = {
  CollectionAuthorityLevelIcon:
    PluginPlaceholder as CollectionAuthorityLevelIcon,
  FormCollectionAuthorityLevelPicker:
    PluginPlaceholder as FormCollectionAuthorityLevelPicker,
};

export type RevisionOrModerationEvent = {
  title: string;
  timestamp: string;
  icon: IconName | { name: IconName; color: string } | Record<string, never>;
  description?: string;
  revision?: Revision;
};

export const PLUGIN_MODERATION = {
  isEnabled: () => false,
  QuestionModerationIcon: PluginPlaceholder,
  QuestionModerationSection: PluginPlaceholder,
  QuestionModerationButton: PluginPlaceholder,
  ModerationReviewBanner: PluginPlaceholder,
  ModerationStatusIcon: PluginPlaceholder,
  getStatusIcon: (moderated_status?: string): string | IconProps | undefined =>
    undefined,
  getModerationTimelineEvents: (
    reviews: any,
    usersById: Record<string, UserListResult>,
    currentUser: User | null,
  ) => [] as RevisionOrModerationEvent[],
  getMenuItems: (
    question?: Question,
    isModerator?: boolean,
    reload?: () => void,
  ) => [],
};

export const PLUGIN_CACHING = {
  dashboardCacheTTLFormField: null,
  questionCacheTTLFormField: null,
  getQuestionsImplicitCacheTTL: (question?: any) => null,
  QuestionCacheSection: PluginPlaceholder,
  DashboardCacheSection: PluginPlaceholder,
  DatabaseCacheTimeField: PluginPlaceholder,
  isEnabled: () => false,
  hasQuestionCacheSection: (question: Question) => false,
};

export const PLUGIN_REDUCERS: {
  applicationPermissionsPlugin: any;
  sandboxingPlugin: any;
  shared: any;
} = {
  applicationPermissionsPlugin: () => null,
  sandboxingPlugin: () => null,
  shared: () => null,
};

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
  getRoutes: (): ReactNode => null,
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

export const PLUGIN_EMBEDDING = {
  isEnabled: () => false,
};

export const PLUGIN_CONTENT_VERIFICATION = {
  VerifiedFilter: {} as SearchFilterComponent<"verified">,
};
