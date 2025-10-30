import type { Middleware } from "@reduxjs/toolkit";
import type { TagDescription } from "@reduxjs/toolkit/query";
import React, {
  type ComponentType,
  type Context,
  type Dispatch,
  type HTMLAttributes,
  type ReactNode,
  type SetStateAction,
  createContext,
  useCallback,
} from "react";
import { t } from "ttag";

import noResultsSource from "assets/img/no_results.svg";
import {
  getPerformanceTabMetadata,
  strategies,
} from "metabase/admin/performance/constants/complex";
import type { ModelWithClearableCache } from "metabase/admin/performance/types";
import { UNABLE_TO_CHANGE_ADMIN_PERMISSIONS } from "metabase/admin/permissions/constants/messages";
import {
  type DataPermission,
  DataPermissionValue,
  type DatabaseEntityId,
  type EntityId,
  type PermissionSubject,
} from "metabase/admin/permissions/types";
import type {
  MetricFilterControlsProps,
  MetricFilterSettings,
} from "metabase/browse/metrics";
import type {
  ModelFilterControlsProps,
  ModelFilterSettings,
} from "metabase/browse/models";
import type { LinkProps } from "metabase/common/components/Link";
import type { DashCardMenuItem } from "metabase/dashboard/components/DashCard/DashCardMenu/dashcard-menu";
import type { DataSourceSelectorProps } from "metabase/embedding-sdk/types/components/data-picker";
import type { ContentTranslationFunction } from "metabase/i18n/types";
import type { ColorName } from "metabase/lib/colors/types";
import { getIconBase } from "metabase/lib/icon";
import type { MetabotContext } from "metabase/metabot";
import {
  NotFoundPlaceholder,
  PluginPlaceholder,
} from "metabase/plugins/components/PluginPlaceholder";
import type { EmbedResourceDownloadOptions } from "metabase/public/lib/types";
import type { SearchFilterComponent } from "metabase/search/types";
import { _FileUploadErrorModal } from "metabase/status/components/FileUploadStatusLarge/FileUploadErrorModal";
import type { IconName, IconProps, StackProps } from "metabase/ui";
import type { HoveredObject } from "metabase/visualizations/types";
import type Question from "metabase-lib/v1/Question";
import type Database from "metabase-lib/v1/metadata/Database";
import type { UiParameter } from "metabase-lib/v1/parameters/types";
import type {
  BaseEntityId,
  BaseUser,
  Bookmark,
  CacheableDashboard,
  CacheableModel,
  CheckDependenciesResponse,
  Collection,
  CollectionAuthorityLevelConfig,
  CollectionEssentials,
  CollectionId,
  CollectionInstanceAnaltyicsConfig,
  DashCardId,
  Dashboard,
  DashboardId,
  DatabaseData,
  DatabaseId,
  DatabaseLocalSettingAvailability,
  Database as DatabaseType,
  Dataset,
  DependencyEntry,
  Document,
  Group,
  GroupPermissions,
  GroupsPermissions,
  ModelCacheRefreshStatus,
  ParameterId,
  Pulse,
  PythonTransformSource,
  PythonTransformTableAliases,
  Revision,
  SearchModel,
  Series,
  TableId,
  Timeline,
  TimelineEvent,
  Transform,
  TransformId,
  UpdateSnippetRequest,
  UpdateTransformRequest,
  User,
  VisualizationDisplay,
} from "metabase-types/api";
import type {
  AdminPath,
  AdminPathKey,
  Dispatch as ReduxDispatch,
  State,
} from "metabase-types/store";
import type { EmbeddingEntityType } from "metabase-types/store/embedding-data-picker";

import type { GetAuthProviders, PluginGroupManagersType } from "./types";

// functions called when the application is started
export const PLUGIN_APP_INIT_FUNCTIONS: (() => void)[] = [];

export const PLUGIN_LANDING_PAGE: {
  getLandingPage: () => string | null | undefined;
  LandingPageWidget: ComponentType;
} = {
  getLandingPage: () => "/",
  LandingPageWidget: PluginPlaceholder,
};

export const PLUGIN_REDUX_MIDDLEWARES: Middleware[] = [];

// override for LogoIcon
export const PLUGIN_LOGO_ICON_COMPONENTS: ComponentType[] = [];

// admin nav items and routes
export const PLUGIN_ADMIN_ALLOWED_PATH_GETTERS: ((
  user: any,
) => AdminPathKey[])[] = [];

export const PLUGIN_ADMIN_TOOLS: {
  COMPONENT: ComponentType | null;
} = {
  COMPONENT: null,
};

export const PLUGIN_WHITELABEL = {
  WhiteLabelBrandingSettingsPage: PluginPlaceholder,
  WhiteLabelConcealSettingsPage: PluginPlaceholder,
};

export const PLUGIN_ADMIN_SETTINGS: {
  InteractiveEmbeddingSettings: ComponentType | null;
  LicenseAndBillingSettings: ComponentType;
  useUpsellFlow: (props: { campaign: string; location: string }) => {
    triggerUpsellFlow: (() => void) | undefined;
  };
} = {
  InteractiveEmbeddingSettings: null,
  LicenseAndBillingSettings: PluginPlaceholder,
  useUpsellFlow: (_props: {
    campaign: string;
    location: string;
  }): {
    triggerUpsellFlow: (() => void) | undefined;
  } => ({
    triggerUpsellFlow: undefined,
  }),
};

// admin permissions
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

// user form fields, e.x. login attributes
export const PLUGIN_ADMIN_USER_FORM_FIELDS = {
  FormLoginAttributes: PluginPlaceholder,
};

// menu items in people management tab
export const PLUGIN_ADMIN_USER_MENU_ITEMS = [] as Array<
  (user: User) => React.ReactNode
>;
export const PLUGIN_ADMIN_USER_MENU_ROUTES = [];

// authentication providers

export const PLUGIN_AUTH_PROVIDERS = {
  isEnabled: () => false,
  AuthSettingsPage: PluginPlaceholder,
  UserProvisioningSettings: NotFoundPlaceholder,
  SettingsSAMLForm: NotFoundPlaceholder,
  SettingsJWTForm: NotFoundPlaceholder,
  providers: [] as GetAuthProviders[],
};

export const PLUGIN_LDAP_FORM_FIELDS = {
  LdapUserProvisioning: PluginPlaceholder,
  LdapGroupMembershipFilter: PluginPlaceholder,
};

// Only show the password tab in account settings if these functions all return true.
// Otherwise, the user is logged in via SSO and should hide first name, last name, and email field in profile settings metabase#23298.
export const PLUGIN_IS_PASSWORD_USER: ((user: User) => boolean)[] = [];

const defaultLandingPageIllustration = {
  src: "app/img/bridge.svg",
  isDefault: true,
};

const defaultLoginPageIllustration = {
  src: "app/img/bridge.svg",
  isDefault: true,
};

const getLoadingMessage = (isSlow: boolean | undefined = false) =>
  isSlow ? t`Waiting for results...` : t`Doing science...`;

// selectors that customize behavior between app versions
export const PLUGIN_SELECTORS = {
  canWhitelabel: (_state: State) => false,
  getLoadingMessageFactory: (_state: State) => getLoadingMessage,
  getIsWhiteLabeling: (_state: State) => false,
  // eslint-disable-next-line no-literal-metabase-strings -- This is the actual Metabase name, so we don't want to translate it.
  getApplicationName: (_state: State) => "Metabase",
  getShowMetabaseLinks: (_state: State) => true,
  getLoginPageIllustration: (_state: State): IllustrationValue => {
    return defaultLoginPageIllustration;
  },
  getLandingPageIllustration: (_state: State): IllustrationValue => {
    return defaultLandingPageIllustration;
  },
  getNoDataIllustration: (_state: State): string | null => {
    return noResultsSource;
  },
  getNoObjectIllustration: (_state: State): string | null => {
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

interface PluginDashboardSubscriptionParametersSectionOverride {
  Component?: ComponentType<{
    className?: string;
    parameters: UiParameter[];
    hiddenParameters?: string;
    dashboard: Dashboard;
    pulse: Pulse;
    setPulseParameters: (parameters: UiParameter[]) => void;
  }>;
}
export const PLUGIN_DASHBOARD_SUBSCRIPTION_PARAMETERS_SECTION_OVERRIDE: PluginDashboardSubscriptionParametersSectionOverride =
  {
    Component: undefined,
  };

const AUTHORITY_LEVEL_REGULAR: CollectionAuthorityLevelConfig = {
  type: null,
  get name() {
    return t`Regular`;
  },
  icon: "folder",
};

export type ItemWithCollection = { collection: CollectionEssentials };

type GetCollectionIdType = (
  sourceCollectionId?: CollectionId | null,
) => CollectionId | null;

export type CollectionAuthorityLevelDisplayProps = {
  collection: Collection;
};

export const PLUGIN_COLLECTIONS = {
  AUTHORITY_LEVEL: {
    [JSON.stringify(AUTHORITY_LEVEL_REGULAR.type)]: AUTHORITY_LEVEL_REGULAR,
  },
  COLLECTION_TYPES: {
    [JSON.stringify(AUTHORITY_LEVEL_REGULAR.type)]: AUTHORITY_LEVEL_REGULAR,
  },
  REGULAR_COLLECTION: AUTHORITY_LEVEL_REGULAR,
  isRegularCollection: (_data: Partial<Collection> | Bookmark) => true,
  isSyncedCollection: (_data: Partial<Collection>) => false,
  getCollectionType: (
    _collection: Partial<Collection>,
  ): CollectionAuthorityLevelConfig | CollectionInstanceAnaltyicsConfig =>
    AUTHORITY_LEVEL_REGULAR,
  useGetDefaultCollectionId: null as GetCollectionIdType | null,
  CUSTOM_INSTANCE_ANALYTICS_COLLECTION_ENTITY_ID: "" as BaseEntityId | "",
  INSTANCE_ANALYTICS_ADMIN_READONLY_MESSAGE: UNABLE_TO_CHANGE_ADMIN_PERMISSIONS,
  getAuthorityLevelMenuItems: (
    _collection: Collection,
    _onUpdate: (collection: Collection, values: Partial<Collection>) => void,
  ): React.ReactNode[] => [],
  getIcon: getIconBase,
  filterOutItemsFromInstanceAnalytics: <Item extends ItemWithCollection>(
    items: Item[],
  ) => items as Item[],
  canCleanUp: (_collection: Collection) => false as boolean,
  useGetCleanUpMenuItems: (
    _collection: Collection,
  ): { menuItems: JSX.Element[] } => ({
    menuItems: [],
  }),
  cleanUpRoute: null as React.ReactElement | null,
  cleanUpAlert: (() => null) as (props: {
    collection: Collection;
  }) => JSX.Element | null,
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
  CollectionAuthorityLevelDisplay:
    PluginPlaceholder as ComponentType<CollectionAuthorityLevelDisplayProps>,
};

export type RevisionOrModerationEvent = {
  title: string;
  timestamp: string;
  icon: IconName | { name: IconName; color: ColorName } | Record<string, never>;
  description?: string;
  revision?: Revision;
};

export const PLUGIN_MODERATION = {
  isEnabled: () => false,
  EntityModerationIcon: PluginPlaceholder,
  QuestionModerationSection: PluginPlaceholder,
  ModerationReviewBanner: PluginPlaceholder,
  ModerationReviewTextForQuestion: PluginPlaceholder,
  ModerationReviewTextForDashboard: PluginPlaceholder,
  ModerationStatusIcon: PluginPlaceholder,
  getQuestionIcon: PluginPlaceholder,
  getStatusIcon: (_moderated_status?: string): string | IconProps | undefined =>
    undefined,
  getModerationTimelineEvents: (_reviews: any, _currentUser: BaseUser | null) =>
    [] as RevisionOrModerationEvent[],
  useDashboardMenuItems: (_model?: Dashboard, _reload?: () => void) => [],
  useQuestionMenuItems: (_model?: Question, _reload?: () => void) => [],
};

export type InvalidateNowButtonProps = {
  targetId: number;
  /** The type of object that the target is */
  targetModel: ModelWithClearableCache;
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
  onClose: () => void;
} & StackProps;

export type PreemptiveCachingSwitchProps = {
  handleSwitchToggle: () => void;
};

export const PLUGIN_CACHING = {
  isGranularCachingEnabled: () => false,
  StrategyFormLauncherPanel: PluginPlaceholder as any,
  GranularControlsExplanation: PluginPlaceholder as any,
  SidebarCacheSection:
    PluginPlaceholder as ComponentType<SidebarCacheSectionProps>,
  SidebarCacheForm: PluginPlaceholder as ComponentType<
    SidebarCacheFormProps & { onBack: () => void }
  >,
  InvalidateNowButton:
    PluginPlaceholder as ComponentType<InvalidateNowButtonProps>,
  hasQuestionCacheSection: (_question: Question) => false,
  canOverrideRootStrategy: false,
  /** Metadata describing the different kinds of strategies */
  strategies: strategies,
  DashboardAndQuestionCachingTab: PluginPlaceholder as any,
  StrategyEditorForQuestionsAndDashboards: PluginPlaceholder as any,
  getTabMetadata: getPerformanceTabMetadata,
  PreemptiveCachingSwitch:
    PluginPlaceholder as ComponentType<PreemptiveCachingSwitchProps>,
};

export const PLUGIN_REDUCERS: {
  applicationPermissionsPlugin: any;
  sandboxingPlugin: any;
  shared: any;
  metabotPlugin: any;
  documents: any;
  remoteSyncPlugin: any;
} = {
  applicationPermissionsPlugin: () => null,
  sandboxingPlugin: () => null,
  shared: () => null,
  metabotPlugin: () => null,
  documents: () => null,
  remoteSyncPlugin: () => null,
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
    canAccessSettings: (_state: any) => false,
    canManageSubscriptions: (_state: any) => true,
  },
};

// Comes with PLUGIN_APPLICATION_PERMISSIONS
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

export const PLUGIN_MODEL_PERSISTENCE = {
  isModelLevelPersistenceEnabled: () => false,
  ModelCacheToggle: PluginPlaceholder as ({
    persistedModel,
    model,
  }: {
    persistedModel?: ModelCacheRefreshStatus;
    model: Question;
  }) => JSX.Element,
};

export const PLUGIN_EMBEDDING = {
  isEnabled: () => false,
  isInteractiveEmbeddingEnabled: (_state: State) => false,
  SimpleDataPicker: (_props: SimpleDataPickerProps): ReactNode => null,
  DataSourceSelector: (_props: DataSourceSelectorProps): ReactNode => null,
};

export interface SimpleDataPickerProps {
  filterByDatabaseId: number | null;
  selectedEntity?: TableId;
  isInitiallyOpen: boolean;
  triggerElement: ReactNode;
  setSourceTableFn: (tableId: TableId) => void;
  entityTypes: EmbeddingEntityType[];
}

export const PLUGIN_EMBEDDING_SDK = {
  isEnabled: () => false,
};

export const PLUGIN_EMBEDDING_IFRAME_SDK = {
  hasValidLicense: () => false,
  SdkIframeEmbedRoute: (): ReactNode => null,
};

export type SdkIframeEmbedSetupModalProps = {
  opened: boolean;
  onClose: () => void;
  initialState?: SdkIframeEmbedSetupModalInitialState;
};

export type SdkIframeEmbedSetupModalInitialState = {
  resourceType?: string | null;
  resourceId?: string | number | null;
  useExistingUserSession?: boolean;
};

export const PLUGIN_EMBEDDING_IFRAME_SDK_SETUP = {
  isFeatureEnabled: () => false,
  shouldShowEmbedInNewItemMenu: () => false,
  SdkIframeEmbedSetupModal: (
    _props: SdkIframeEmbedSetupModalProps,
  ): ReactNode => null,
};

export const PLUGIN_CONTENT_VERIFICATION = {
  contentVerificationEnabled: false,
  VerifiedFilter: {} as SearchFilterComponent<"verified">,
  sortCollectionsByVerification: (
    _a: CollectionEssentials,
    _b: CollectionEssentials,
  ) => 0,

  ModelFilterControls: (_props: ModelFilterControlsProps) => null,
  getDefaultModelFilters: (_state: State): ModelFilterSettings => ({
    verified: false,
  }),

  getDefaultMetricFilters: (_state: State): MetricFilterSettings => ({
    verified: false,
  }),
  MetricFilterControls: (_props: MetricFilterControlsProps) => null,
};

export type InsightsLinkProps = (
  | {
      question: Pick<Question, "id" | "collection">;
      dashboard?: never;
    }
  | {
      question?: never;
      dashboard: Pick<Dashboard, "id" | "collection">;
    }
) &
  Omit<LinkProps, "to">;

export const PLUGIN_AUDIT = {
  isAuditDb: (_db: DatabaseType) => false,
  InsightsLink: PluginPlaceholder as ComponentType<InsightsLinkProps>,
};

type GdriveConnectionModalProps = {
  isModalOpen: boolean;
  onClose: () => void;
  reconnect: boolean;
};

type GdriveAddDataPanelProps = {
  onAddDataModalClose: () => void;
};

export const PLUGIN_UPLOAD_MANAGEMENT = {
  FileUploadErrorModal: _FileUploadErrorModal,
  UploadManagementTable: PluginPlaceholder,
  GdriveSyncStatus: PluginPlaceholder,
  GdriveConnectionModal:
    PluginPlaceholder as ComponentType<GdriveConnectionModalProps>,
  GdriveDbMenu: PluginPlaceholder,
  GdriveAddDataPanel:
    PluginPlaceholder as ComponentType<GdriveAddDataPanelProps>,
};

export const PLUGIN_IS_EE_BUILD = {
  isEEBuild: () => false,
};

export const PLUGIN_RESOURCE_DOWNLOADS = {
  /**
   * Returns if 'download results' on cards and pdf exports are enabled in public and embedded contexts.
   */
  areDownloadsEnabled: (_args: {
    downloads?: string | boolean | null;
  }): EmbedResourceDownloadOptions => ({
    pdf: true,
    results: true,
  }),
};

const defaultMetabotContextValue: MetabotContext = {
  prompt: "",
  setPrompt: () => {},
  promptInputRef: undefined,
  getChatContext: () => ({}) as any,
  registerChatContextProvider: () => () => {},
};

export type PluginAiSqlFixer = {
  FixSqlQueryButton: ComponentType<Record<string, never>>;
};

export const PLUGIN_AI_SQL_FIXER: PluginAiSqlFixer = {
  FixSqlQueryButton: PluginPlaceholder,
};

export interface AIDashboardAnalysisSidebarProps {
  onClose?: () => void;
  dashcardId?: DashCardId;
}

export interface AIQuestionAnalysisSidebarProps {
  question: Question;
  className?: string;
  onClose?: () => void;
  timelines?: Timeline[];
  visibleTimelineEvents?: TimelineEvent[];
}

export type PluginAIEntityAnalysis = {
  AIQuestionAnalysisButton: ComponentType<any>;
  AIQuestionAnalysisSidebar: ComponentType<AIQuestionAnalysisSidebarProps>;
  AIDashboardAnalysisSidebar: ComponentType<AIDashboardAnalysisSidebarProps>;
  canAnalyzeQuestion: (question: Question) => boolean;
  chartAnalysisRenderFormats: {
    [display in VisualizationDisplay]?: "png" | "svg" | "none";
  };
};

export const PLUGIN_AI_ENTITY_ANALYSIS: PluginAIEntityAnalysis = {
  AIQuestionAnalysisButton: PluginPlaceholder,
  AIQuestionAnalysisSidebar: PluginPlaceholder,
  AIDashboardAnalysisSidebar: PluginPlaceholder,
  canAnalyzeQuestion: () => false,
  chartAnalysisRenderFormats: {},
};

type PluginMetabotConfig = {
  emptyText?: string;
  hideSuggestedPrompts?: boolean;
  preventClose?: boolean;
  preventRetryMessage?: boolean;
  suggestionModels: (SearchModel | "transform" | "user")[];
};

type PluginMetabotType = {
  isEnabled: () => boolean;
  Metabot: (props: {
    hide?: boolean;
    config?: PluginMetabotConfig;
  }) => React.ReactElement | null;
  defaultMetabotContextValue: MetabotContext;
  MetabotContext: React.Context<MetabotContext>;
  getMetabotProvider: () => ComponentType<{ children: React.ReactNode }>;
  getAdminPaths: () => AdminPath[];
  getAdminRoutes: () => React.ReactElement;
  getMetabotRoutes: () => React.ReactElement | null;
  MetabotAdminPage: ComponentType;
  getMetabotVisible: (state: State) => boolean;
  MetabotToggleButton: ComponentType<{ className?: string }>;
  MetabotAppBarButton: ComponentType;
  MetabotAdminAppBarButton: ComponentType;
};

export const PLUGIN_METABOT: PluginMetabotType = {
  isEnabled: () => false,
  Metabot: (_props: { hide?: boolean; config?: PluginMetabotConfig }) =>
    null as React.ReactElement | null,
  defaultMetabotContextValue,
  MetabotContext: React.createContext(defaultMetabotContextValue),
  getMetabotProvider: () => {
    return ({ children }) =>
      React.createElement(
        PLUGIN_METABOT.MetabotContext.Provider,
        { value: PLUGIN_METABOT.defaultMetabotContextValue },
        children,
      );
  },
  getAdminPaths: () => [],
  getAdminRoutes: () => PluginPlaceholder as unknown as React.ReactElement,
  getMetabotRoutes: () => null,
  MetabotAdminPage: () => `placeholder`,
  getMetabotVisible: () => false,
  MetabotToggleButton: PluginPlaceholder,
  MetabotAppBarButton: PluginPlaceholder,
  MetabotAdminAppBarButton: PluginPlaceholder,
};

type DashCardMenuItemGetter = (
  question: Question,
  dashcardId: DashCardId | undefined,
  dispatch: ReduxDispatch,
) => (DashCardMenuItem & { key: string }) | null;

export type PluginDashcardMenu = {
  dashcardMenuItemGetters: DashCardMenuItemGetter[];
};

export const PLUGIN_DASHCARD_MENU: PluginDashcardMenu = {
  dashcardMenuItemGetters: [],
};

export const PLUGIN_CONTENT_TRANSLATION = {
  isEnabled: false,
  setEndpointsForStaticEmbedding: (_encodedToken: string) => {},
  ContentTranslationConfiguration: PluginPlaceholder,
  useTranslateContent: <
    T = string | null | undefined,
  >(): ContentTranslationFunction => {
    // In OSS, the input is not translated
    return useCallback(<U = T>(arg: U) => arg, []);
  },
  translateDisplayNames: <T extends object>(
    obj: T,
    _tc: ContentTranslationFunction,
  ) => obj,
  useTranslateFieldValuesInHoveredObject: (obj?: HoveredObject | null) => obj,
  useTranslateSeries: (obj: Series) => obj,
  useSortByContentTranslation: () => (a: string, b: string) =>
    a.localeCompare(b),
};

export const PLUGIN_DB_ROUTING = {
  DatabaseRoutingSection: PluginPlaceholder as ComponentType<{
    database: DatabaseType;
  }>,
  getDatabaseNameFieldProps: (_isSlug: boolean) => ({}),
  getDestinationDatabaseRoutes: (_IsAdmin: any) =>
    null as React.ReactElement | null,
  useRedirectDestinationDatabase: (
    _database: Pick<DatabaseType, "id" | "router_database_id"> | undefined,
  ): void => {},
  getPrimaryDBEngineFieldState: (
    _database: Pick<Database, "router_user_attribute">,
  ): "default" | "hidden" | "disabled" => "default",
};

export const PLUGIN_DATABASE_REPLICATION = {
  DatabaseReplicationSection: PluginPlaceholder as ComponentType<{
    database: DatabaseType;
  }>,
};

export const PLUGIN_API = {
  getRemappedCardParameterValueUrl: (
    dashboardId: DashboardId,
    parameterId: ParameterId,
  ) =>
    `/api/card/${dashboardId}/params/${encodeURIComponent(parameterId)}/remapping`,
  getRemappedDashboardParameterValueUrl: (
    dashboardId: DashboardId,
    parameterId: ParameterId,
  ) =>
    `/api/dashboard/${dashboardId}/params/${encodeURIComponent(parameterId)}/remapping`,
};

export const PLUGIN_SMTP_OVERRIDE: {
  CloudSMTPConnectionCard: ComponentType;
  SMTPOverrideConnectionForm: ComponentType<{ onClose: () => void }>;
} = {
  CloudSMTPConnectionCard: PluginPlaceholder,
  SMTPOverrideConnectionForm: PluginPlaceholder,
};

export const PLUGIN_TABLE_EDITING = {
  isEnabled: () => false,
  isDatabaseTableEditingEnabled: (_database: DatabaseType): boolean => false,
  getRoutes: () => null as React.ReactElement | null,
  getTableEditUrl: (_tableId: TableId, _databaseId: DatabaseId): string => "/",
  AdminDatabaseTableEditingSection: PluginPlaceholder as ComponentType<{
    database: DatabaseType;
    settingsAvailable?: Record<string, DatabaseLocalSettingAvailability>;
    updateDatabase: (
      database: { id: DatabaseId } & Partial<DatabaseData>,
    ) => Promise<void>;
  }>,
};

export const PLUGIN_DOCUMENTS = {
  getRoutes: () => null as React.ReactElement | null,
  shouldShowDocumentInNewItemMenu: () => false,
  getCurrentDocument: (_state: any) => null as Document | null,
  getSidebarOpen: (_state: any) => false,
  getCommentSidebarOpen: (_state: any) => false,
  DocumentCopyForm: (_props: any) => null as React.ReactElement | null,
};

export const PLUGIN_PUBLIC_SHARING = {
  PublicDocumentRoute: (_props: any) => null as React.ReactElement | null,
  PublicLinksDocumentListing: () => null as React.ReactElement | null,
};

export const PLUGIN_ENTITIES = {
  entities: {} as Record<string, any>,
};

export const PLUGIN_SEMANTIC_SEARCH = {
  SearchSettingsWidget: PluginPlaceholder,
};

export type TransformPickerItem = {
  id: TransformId;
  name: string;
  model: "transform";
};

export type TransformPickerProps = {
  value: TransformPickerItem | undefined;
  onItemSelect: (transform: TransformPickerItem) => void;
};

export type TransformsPlugin = {
  TransformPicker: ComponentType<TransformPickerProps>;
  getAdminPaths(): AdminPath[];
  getAdminRoutes(): ReactNode;
};

export const PLUGIN_TRANSFORMS: TransformsPlugin = {
  TransformPicker: PluginPlaceholder,
  getAdminPaths: () => [],
  getAdminRoutes: () => null,
};

export const PLUGIN_REMOTE_SYNC: {
  LibraryNav: ComponentType;
  RemoteSyncSettings: ComponentType;
  SyncedCollectionsSidebarSection: ComponentType<{
    syncedCollections: any[];
    collectionItem: any;
    onItemSelect: () => void;
  }>;
  REMOTE_SYNC_INVALIDATION_TAGS: TagDescription<any>[] | null;
  useSyncStatus: () => {
    isIdle: boolean;
    taskType: any;
    progress: number;
    message: string;
    progressModal: ReactNode;
  };
} = {
  LibraryNav: PluginPlaceholder,
  RemoteSyncSettings: NotFoundPlaceholder,
  SyncedCollectionsSidebarSection: PluginPlaceholder,
  REMOTE_SYNC_INVALIDATION_TAGS: null,
  useSyncStatus: () => ({
    isIdle: true,
    taskType: null,
    progress: 0,
    message: "",
    progressModal: null,
  }),
};

export type PythonTransformsPlugin = {
  PythonRunnerSettingsPage: ComponentType;
  SourceSection: ComponentType<{ transform: Transform }>;
  TransformEditor: ComponentType<{
    transform?: Transform | undefined;
    initialSource: {
      type: "python";
      body: string;
      "source-database": DatabaseId | undefined;
      "source-tables": PythonTransformTableAliases;
    };
    proposedSource?: PythonTransformSource;
    isNew?: boolean;
    isSaving?: boolean;
    isRunnable?: boolean;
    onChange?: (newSource: {
      type: "python";
      body: string;
      "source-database": DatabaseId | undefined;
      "source-tables": PythonTransformTableAliases;
    }) => void;
    onSave: (newSource: PythonTransformSource) => void;
    onCancel: () => void;
    onRejectProposed?: () => void;
    onAcceptProposed?: (query: PythonTransformSource) => void;
  }>;
  getAdminRoutes: () => ReactNode;
  getTransformsNavLinks: () => ReactNode;
  getCreateTransformsMenuItems: () => ReactNode;
};

export const PLUGIN_TRANSFORMS_PYTHON: PythonTransformsPlugin = {
  PythonRunnerSettingsPage: NotFoundPlaceholder,
  TransformEditor: NotFoundPlaceholder,
  SourceSection: PluginPlaceholder,
  getAdminRoutes: () => null,
  getTransformsNavLinks: () => null,
  getCreateTransformsMenuItems: () => null,
};

type DependenciesPlugin = {
  isEnabled: boolean;
  DependencyGraphPage: ComponentType;
  DependencyGraphPageContext: Context<DependencyGraphPageContextType>;
  CheckDependenciesForm: ComponentType<CheckDependenciesFormProps>;
  CheckDependenciesModal: ComponentType<CheckDependenciesModalProps>;
  CheckDependenciesTitle: ComponentType;
  useCheckCardDependencies: (
    props: UseCheckDependenciesProps<Question>,
  ) => UseCheckDependenciesResult<Question>;
  useCheckSnippetDependencies: (
    props: UseCheckDependenciesProps<UpdateSnippetRequest>,
  ) => UseCheckDependenciesResult<UpdateSnippetRequest>;
  useCheckTransformDependencies: (
    props: UseCheckDependenciesProps<UpdateTransformRequest>,
  ) => UseCheckDependenciesResult<UpdateTransformRequest>;
};

export type DependencyGraphPageContextType = {
  baseUrl?: string;
  defaultEntry?: DependencyEntry;
};

export type CheckDependenciesFormProps = {
  checkData: CheckDependenciesResponse;
  onSave: () => void | Promise<void>;
  onCancel: () => void;
};

export type CheckDependenciesModalProps = {
  checkData: CheckDependenciesResponse;
  opened: boolean;
  onSave: () => void | Promise<void>;
  onClose: () => void;
};

export type UseCheckDependenciesProps<TChange> = {
  onSave: (change: TChange) => Promise<void>;
};

export type UseCheckDependenciesResult<TChange> = {
  checkData?: CheckDependenciesResponse;
  isCheckingDependencies: boolean;
  isConfirmationShown: boolean;
  handleInitialSave: (change: TChange) => Promise<void>;
  handleSaveAfterConfirmation: () => Promise<void>;
  handleCloseConfirmation: () => void;
};

function useCheckDependencies<TChange>({
  onSave,
}: UseCheckDependenciesProps<TChange>): UseCheckDependenciesResult<TChange> {
  return {
    isConfirmationShown: false,
    isCheckingDependencies: false,
    handleInitialSave: onSave,
    handleSaveAfterConfirmation: () => Promise.resolve(),
    handleCloseConfirmation: () => undefined,
  };
}

export const PLUGIN_DEPENDENCIES: DependenciesPlugin = {
  isEnabled: false,
  DependencyGraphPage: PluginPlaceholder,
  DependencyGraphPageContext: createContext({}),
  CheckDependenciesForm: PluginPlaceholder,
  CheckDependenciesModal: PluginPlaceholder,
  CheckDependenciesTitle: PluginPlaceholder,
  useCheckCardDependencies: useCheckDependencies,
  useCheckSnippetDependencies: useCheckDependencies,
  useCheckTransformDependencies: useCheckDependencies,
};
