import type { ComponentType, HTMLAttributes, ReactNode } from "react";
import { t } from "ttag";
import type { AnySchema } from "yup";

import { UNABLE_TO_CHANGE_ADMIN_PERMISSIONS } from "metabase/admin/permissions/constants/messages";
import type {
  DataPermission,
  DatabaseEntityId,
  PermissionSubject,
} from "metabase/admin/permissions/types";
import type { ADMIN_SETTINGS_SECTIONS } from "metabase/admin/settings/selectors";
import PluginPlaceholder from "metabase/plugins/components/PluginPlaceholder";
import type { SearchFilterComponent } from "metabase/search/types";
import type { IconName, IconProps } from "metabase/ui";
import type Question from "metabase-lib/Question";
import type Database from "metabase-lib/metadata/Database";
import type {
  Bookmark,
  Collection,
  CollectionAuthorityLevelConfig,
  CollectionInstanceAnaltyicsConfig,
  Dashboard,
  Dataset,
  Group,
  GroupPermissions,
  GroupsPermissions,
  Revision,
  User,
  UserListResult,
} from "metabase-types/api";
import type { AdminPathKey, State } from "metabase-types/store";

import type { GetAuthProviders, PluginGroupManagersType } from "./types";

// functions called when the application is started
export const PLUGIN_APP_INIT_FUNCTIONS = [];

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
export const PLUGIN_ADMIN_USER_FORM_FIELDS = {
  FormLoginAttributes: PluginPlaceholder,
};

// menu items in people management tab
export const PLUGIN_ADMIN_USER_MENU_ITEMS = [];
export const PLUGIN_ADMIN_USER_MENU_ROUTES = [];

// authentication providers
export const PLUGIN_AUTH_PROVIDERS: GetAuthProviders[] = [];

export const PLUGIN_LDAP_FORM_FIELDS = {
  formFieldAttributes: [] as string[],
  defaultableFormFieldAttributes: [] as string[],
  formFieldsSchemas: {} as Record<string, AnySchema>,
  UserProvisioning: (() => null) as ComponentType<{
    settings: {
      [setting: string]: {
        display_name?: string | undefined;
        warningMessage?: string | undefined;
        description?: string | undefined;
        note?: string | undefined;
      };
    };
    fields: {
      [field: string]: {
        name: string;
        default: boolean;
      };
    };
  }>,
};

// Only show the password tab in account settings if these functions all return true.
// Otherwise, the user is logged in via SSO and should hide first name, last name, and email field in profile settings metabase#23298.
export const PLUGIN_IS_PASSWORD_USER: ((user: User) => boolean)[] = [];

// selectors that customize behavior between app versions
export const PLUGIN_SELECTORS = {
  canWhitelabel: (_state: State) => false,
  getLoadingMessageFactory: (_state: State) => (isSlow: boolean) =>
    isSlow ? t`Waiting for results...` : t`Doing science...`,
  getIsWhiteLabeling: (_state: State) => false,
  getApplicationName: (_state: State) => "Metabase",
  getShowMetabaseLinks: (_state: State) => true,
  getDashboardOverviewId: (_state: State) => undefined,
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
  COLLECTION_TYPES: {
    [JSON.stringify(AUTHORITY_LEVEL_REGULAR.type)]: AUTHORITY_LEVEL_REGULAR,
  },
  REGULAR_COLLECTION: AUTHORITY_LEVEL_REGULAR,
  isRegularCollection: (_: Partial<Collection> | Bookmark) => true,
  getCollectionType: (
    _: Partial<Collection>,
  ): CollectionAuthorityLevelConfig | CollectionInstanceAnaltyicsConfig =>
    AUTHORITY_LEVEL_REGULAR,
  getInstanceAnalyticsCustomCollection: (
    _collections: Collection[],
  ): Collection | null => null,
  CUSTOM_INSTANCE_ANALYTICS_COLLECTION_ENTITY_ID: "",
  INSTANCE_ANALYTICS_ADMIN_READONLY_MESSAGE: UNABLE_TO_CHANGE_ADMIN_PERMISSIONS,
  getAuthorityLevelMenuItems: (
    _collection: Collection,
    _onUpdate: (collection: Collection, values: Partial<Collection>) => void,
  ): AuthorityLevelMenuItem[] => [],
};

export type CollectionAuthorityLevelIcon = ComponentType<
  Omit<IconProps, "name" | "tooltip"> & {
    collection: Pick<Collection, "authority_level">;
    tooltip?: "default" | "belonging";
  }
>;

type CollectionInstanceAnalyticsIcon = React.ComponentType<
  Omit<IconProps, "name"> & {
    collection: Collection;
    entity: "collection" | "question" | "model" | "dashboard";
  }
>;

type FormCollectionAuthorityLevelPicker = React.ComponentType<
  HTMLAttributes<HTMLDivElement> & { name: string; title?: string }
>;

export const PLUGIN_COLLECTION_COMPONENTS = {
  CollectionAuthorityLevelIcon:
    PluginPlaceholder as CollectionAuthorityLevelIcon,
  FormCollectionAuthorityLevelPicker:
    PluginPlaceholder as FormCollectionAuthorityLevelPicker,
  CollectionInstanceAnalyticsIcon:
    PluginPlaceholder as CollectionInstanceAnalyticsIcon,
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
  getQuestionIcon: PluginPlaceholder,
  getStatusIcon: (_moderated_status?: string): string | IconProps | undefined =>
    undefined,
  getModerationTimelineEvents: (
    _reviews: any,
    _usersById: Record<string, UserListResult>,
    _currentUser: User | null,
  ) => [] as RevisionOrModerationEvent[],
  getMenuItems: (
    _question?: Question,
    _isModerator?: boolean,
    _reload?: () => void,
  ) => [],
};

export const PLUGIN_CACHING = {
  dashboardCacheTTLFormField: null,
  questionCacheTTLFormField: null,
  getQuestionsImplicitCacheTTL: (_question?: any) => null,
  QuestionCacheSection: PluginPlaceholder,
  DashboardCacheSection: PluginPlaceholder,
  DatabaseCacheTimeField: PluginPlaceholder,
  isEnabled: () => false,
  hasQuestionCacheSection: (_question: Question) => false,
};

export const PLUGIN_REDUCERS: {
  applicationPermissionsPlugin: any;
  sandboxingPlugin: any;
  shared: any;
  auditInfo: any;
} = {
  applicationPermissionsPlugin: () => null,
  sandboxingPlugin: () => null,
  shared: () => null,
  auditInfo: () => null,
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
  getMenuItems: (_question?: any, _onChange?: any) => ({}),
};

export const PLUGIN_EMBEDDING = {
  isEnabled: () => false,
  isInteractiveEmbeddingEnabled: (_state: State) => false,
};

export const PLUGIN_CONTENT_VERIFICATION = {
  VerifiedFilter: {} as SearchFilterComponent<"verified">,
};

export const PLUGIN_DASHBOARD_HEADER = {
  extraButtons: (_dashboard: Dashboard) => [],
};

export const PLUGIN_QUERY_BUILDER_HEADER = {
  extraButtons: (_question: Question) => [],
};

export const PLUGIN_IS_EE_BUILD = {
  isEEBuild: () => false,
};
