import type {
  ComponentType,
  Dispatch,
  HTMLAttributes,
  ReactNode,
  SetStateAction,
} from "react";
import { t } from "ttag";
import _ from "underscore";
import type { AnySchema } from "yup";

import noResultsSource from "assets/img/no_results.svg";
import { strategies } from "metabase/admin/performance/constants/complex";
import { UNABLE_TO_CHANGE_ADMIN_PERMISSIONS } from "metabase/admin/permissions/constants/messages";
import {
  DataPermissionValue,
  type DatabaseEntityId,
  type DataPermission,
  type EntityId,
  type PermissionSubject,
} from "metabase/admin/permissions/types";
import type { ADMIN_SETTINGS_SECTIONS } from "metabase/admin/settings/selectors";
import type {
  ActualModelFilters,
  AvailableModelFilters,
  ModelFilterControlsProps,
} from "metabase/browse/utils";
import { getIconBase } from "metabase/lib/icon";
import PluginPlaceholder from "metabase/plugins/components/PluginPlaceholder";
import type { SearchFilterComponent } from "metabase/search/types";
import type { GroupProps, IconName, IconProps } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";
import type Database from "metabase-lib/v1/metadata/Database";
import type {
  Database as DatabaseType,
  Bookmark,
  CacheableDashboard,
  CacheableModel,
  Collection,
  CollectionAuthorityLevelConfig,
  CollectionEssentials,
  CollectionInstanceAnaltyicsConfig,
  Dashboard,
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

import type {
  GetAuthProviders,
  PluginGroupManagersType,
  PluginLLMAutoDescription,
} from "./types";

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
        { databaseId }: DatabaseEntityId,
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

// user form fields, e.x. login attributes
export const PLUGIN_ADMIN_USER_FORM_FIELDS = {
  FormLoginAttributes: PluginPlaceholder,
};

// menu items in people management tab
export const PLUGIN_ADMIN_USER_MENU_ITEMS = [];
export const PLUGIN_ADMIN_USER_MENU_ROUTES = [];

// auth settings
interface AuthTabs {
  name: string;
  key: string;
  to: string;
}

export const PLUGIN_ADMIN_SETTINGS_AUTH_TABS: AuthTabs[] = [];

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
  // eslint-disable-next-line no-literal-metabase-strings -- This is the actual Metabase name, so we don't want to translate it.
  getApplicationName: (_state: State) => "Metabase",
  getShowMetabaseLinks: (_state: State) => true,
  getLoginPageIllustration: (_state: State): IllustrationValue => {
    return {
      src: "app/img/bridge.svg",
      isDefault: true,
    };
  },
  getLandingPageIllustration: (_state: State): IllustrationValue => {
    return {
      src: "app/img/bridge.svg",
      isDefault: true,
    };
  },
  getNoDataIllustration: (_state: State): string => {
    return noResultsSource;
  },
  getNoObjectIllustration: (_state: State): string => {
    return noResultsSource;
  },
};

export type IllustrationValue = {
  src: string;
  isDefault: boolean;
} | null;

export const PLUGIN_FORM_WIDGETS: Record<string, ComponentType<any>> = {};

// snippet sidebar
export const PLUGIN_SNIPPET_SIDEBAR_PLUS_MENU_OPTIONS = [];
export const PLUGIN_SNIPPET_SIDEBAR_ROW_RENDERERS = {};
export const PLUGIN_SNIPPET_SIDEBAR_MODALS = [];
export const PLUGIN_SNIPPET_SIDEBAR_HEADER_BUTTONS = [];

export const PLUGIN_DASHBOARD_SUBSCRIPTION_PARAMETERS_SECTION_OVERRIDE = {
  Component: undefined,
};

export const PLUGIN_LLM_AUTODESCRIPTION: PluginLLMAutoDescription = {
  isEnabled: () => false,
  LLMSuggestQuestionInfo: PluginPlaceholder,
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

type CleanUpMenuItem = {
  title: string;
  icon: string;
  link: string;
};

export type ItemWithCollection = { collection: CollectionEssentials };

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
  getIcon: getIconBase,
  filterOutItemsFromInstanceAnalytics: <Item extends ItemWithCollection>(
    items: Item[],
  ) => items as Item[],
  canCleanUp: false,
  getCleanUpMenuItems: (
    _itemCount: number,
    _url: string,
    _isInstanceAnalyticsCustom: boolean,
    _isTrashed: boolean,
    _canWrite: boolean,
  ): CleanUpMenuItem[] => [],
  cleanUpRoute: null as React.ReactElement | null,
};

export type CollectionAuthorityLevelIcon = ComponentType<
  Omit<IconProps, "name" | "tooltip"> & {
    collection: Pick<Collection, "authority_level">;
    tooltip?: "default" | "belonging";
    archived?: boolean;
  }
>;

type CollectionInstanceAnalyticsIcon = React.ComponentType<
  Omit<IconProps, "name"> & {
    collection: Collection;
    entity: "collection" | "question" | "model" | "dashboard" | "metric";
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

export type InvalidateNowButtonProps = {
  targetId: number;
  targetModel: CacheableModel;
  targetName: string;
};

export type SidebarCacheSectionProps = {
  item: CacheableDashboard | Question;
  model: CacheableModel;
  setPage: Dispatch<SetStateAction<"default" | "caching">>;
};

export type SidebarCacheFormProps = {
  item: CacheableDashboard | Question;
  model: CacheableModel;
  setPage: (page: "default" | "caching") => void;
} & GroupProps;

export const PLUGIN_CACHING = {
  isGranularCachingEnabled: () => false,
  StrategyFormLauncherPanel: PluginPlaceholder as any,
  GranularControlsExplanation: PluginPlaceholder as any,
  DashboardStrategySidebar: PluginPlaceholder as any,
  SidebarCacheSection:
    PluginPlaceholder as ComponentType<SidebarCacheSectionProps>,
  SidebarCacheForm: PluginPlaceholder as ComponentType<SidebarCacheFormProps>,
  InvalidateNowButton:
    PluginPlaceholder as ComponentType<InvalidateNowButtonProps>,
  hasQuestionCacheSection: (_question: Question) => false,
  canOverrideRootStrategy: false,
  /** Metadata describing the different kinds of strategies */
  strategies: strategies,
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
  availableModelFilters: {} as AvailableModelFilters,
  ModelFilterControls: (() => null) as ComponentType<ModelFilterControlsProps>,
  sortModelsByVerification: (_a: SearchResult, _b: SearchResult) => 0,
  sortCollectionsByVerification: (
    _a: CollectionEssentials,
    _b: CollectionEssentials,
  ) => 0,
  useModelFilterSettings: () =>
    [{}, _.noop] as [
      ActualModelFilters,
      Dispatch<SetStateAction<ActualModelFilters>>,
    ],
};

export const PLUGIN_DASHBOARD_HEADER = {
  extraButtons: (_dashboard: Dashboard) => [],
};

export const PLUGIN_QUERY_BUILDER_HEADER = {
  extraButtons: (_question: Question) => [],
};

export const PLUGIN_AUDIT = {
  isAuditDb: (_db: DatabaseType) => false,
};

export const PLUGIN_UPLOAD_MANAGEMENT = {
  UploadManagementTable: PluginPlaceholder,
};

export const PLUGIN_IS_EE_BUILD = {
  isEEBuild: () => false,
};

export const PLUGIN_RESOURCE_DOWNLOADS = {
  /**
   * Returns if 'download results' on cards and pdf exports are enabled in public and embedded contexts.
   */
  areDownloadsEnabled: (_args: {
    hide_download_button?: boolean | null;
    downloads?: boolean | null;
  }) => true,
};
