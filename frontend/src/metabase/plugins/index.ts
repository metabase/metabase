export {
  PLUGIN_AUDIT,
  type InsightsLinkProps,
  type InsightsMenuItemProps,
} from "./oss/audit";
export {
  PLUGIN_AUTH_PROVIDERS,
  PLUGIN_LDAP_FORM_FIELDS,
  PLUGIN_IS_PASSWORD_USER,
  PLUGIN_ADMIN_USER_FORM_FIELDS,
  type AuthSettingsPageProps,
  type AuthSettingsPageTab,
} from "./oss/auth";
export {
  PLUGIN_CACHING,
  PerformanceTabId,
  defaultMinDurationMs,
  doNotCacheStrategyValidationSchema,
  getAdaptiveStrategyValidationSchema,
  getPerformanceTabMetadata,
  getPositiveIntegerSchema,
  inheritStrategyValidationSchema,
  isModelWithClearableCache,
  strategies,
  type InvalidateNowButtonProps,
  type MetricCachingModalProps,
  type ModelWithClearableCache,
  type SidebarCacheSectionProps,
  type SidebarCacheFormProps,
  type PreemptiveCachingSwitchProps,
  type StrategyData,
  type StrategyLabel,
} from "./oss/caching";
export {
  PLUGIN_COLLECTIONS,
  PLUGIN_COLLECTION_COMPONENTS,
  type ItemWithCollection,
  type CollectionAuthorityLevelDisplayProps,
  type CollectionAuthorityLevelIcon,
} from "./oss/collections";
export { PLUGIN_CONTENT_TRANSLATION } from "./oss/content-translation";
export {
  type LoadCustomVizPluginForDisplayResult,
  PLUGIN_CUSTOM_VIZ,
} from "./oss/custom-viz";
export {
  PLUGIN_CONTENT_VERIFICATION,
  type ModelFilterControlsProps,
  type ModelFilterSettings,
  type MetricFilterControlsProps,
  type MetricFilterSettings,
} from "./oss/content-verification";
export {
  PLUGIN_APP_INIT_FUNCTIONS,
  PLUGIN_LANDING_PAGE,
  PLUGIN_HOMEPAGE_SETTING,
  PLUGIN_REDUX_MIDDLEWARES,
  PLUGIN_LOGO_ICON_COMPONENTS,
  PLUGIN_ADMIN_ALLOWED_PATH_GETTERS,
  PLUGIN_SELECTORS,
  PLUGIN_FORM_WIDGETS,
  PLUGIN_SNIPPET_SIDEBAR_PLUS_MENU_OPTIONS,
  PLUGIN_SNIPPET_SIDEBAR_ROW_RENDERERS,
  PLUGIN_SNIPPET_SIDEBAR_HEADER_BUTTONS,
  PLUGIN_DASHBOARD_SUBSCRIPTION_PARAMETERS_SECTION_OVERRIDE,
  PLUGIN_REDUCERS,
  PLUGIN_IS_EE_BUILD,
  type IllustrationValue,
} from "./oss/core";
export {
  PLUGIN_DB_ROUTING,
  PLUGIN_DATABASE_REPLICATION,
  PLUGIN_TABLE_EDITING,
} from "./oss/database";
export { PLUGIN_DATA_APPS } from "./oss/data-apps";
export { PLUGIN_EMBEDDING, type SimpleDataPickerProps } from "./oss/embedding";
export { PLUGIN_EMBEDDING_IFRAME_SDK } from "./oss/embedding-iframe-sdk";
export {
  PLUGIN_EMBEDDING_IFRAME_SDK_SETUP,
  type SdkIframeEmbedSetupModalProps,
  type SdkIframeEmbedSetupModalInitialState,
  type SdkIframeEmbedSetupExperience,
  type LegacyStaticEmbeddingModalProps,
} from "./oss/embedding-iframe-sdk-setup";
export { PLUGIN_EMBEDDING_SDK } from "./oss/embedding-sdk";
export {
  PLUGIN_NOTIFICATIONS_SDK,
  type DashboardSubscriptionsButtonProps,
  type QuestionAlertsButtonProps,
} from "./oss/notifications-sdk";
export {
  PLUGIN_LIBRARY,
  type CollectionPermissionsModalProps,
  type CreateLibraryModalProps,
  type PublishTablesModalProps,
  type UnpublishTablesModalProps,
} from "./oss/library";
export {
  PLUGIN_METABOT,
  type MetabaseAIProviderSetupProps,
} from "./oss/metabot";
export { PLUGIN_MODEL_PERSISTENCE } from "./oss/model-persistence";
export {
  PLUGIN_MULTI_FACTOR_AUTH,
  type AuthChallengeFormProps,
} from "./oss/multi-factor-auth";
export {
  PLUGIN_MODERATION,
  type RevisionOrModerationEvent,
} from "./oss/moderation";
export {
  PLUGIN_ADMIN_PERMISSIONS_DATABASE_ROUTES,
  PLUGIN_ADMIN_PERMISSIONS_DATABASE_GROUP_ROUTES,
  PLUGIN_ADMIN_PERMISSIONS_DATABASE_POST_ACTIONS,
  PLUGIN_ADMIN_PERMISSIONS_DATABASE_ACTIONS,
  PLUGIN_ADMIN_PERMISSIONS_TABLE_OPTIONS,
  PLUGIN_ADMIN_PERMISSIONS_TABLE_ROUTES,
  PLUGIN_ADMIN_PERMISSIONS_TABLE_GROUP_ROUTES,
  PLUGIN_ADMIN_PERMISSIONS_TABLE_FIELDS_OPTIONS,
  PLUGIN_ADMIN_PERMISSIONS_TABLE_FIELDS_CONFIRMATIONS,
  PLUGIN_ADMIN_PERMISSIONS_TABLE_FIELDS_ACTIONS,
  PLUGIN_ADMIN_PERMISSIONS_TABLE_FIELDS_POST_ACTION,
  PLUGIN_DATA_PERMISSIONS,
  PLUGIN_ADMIN_USER_MENU_ITEMS,
  PLUGIN_ADMIN_USER_MENU_ROUTES,
  PLUGIN_ADVANCED_PERMISSIONS,
  PLUGIN_FEATURE_LEVEL_PERMISSIONS,
  PLUGIN_ADMIN_PERMISSIONS_TABS,
  PLUGIN_APPLICATION_PERMISSIONS,
  PLUGIN_GROUP_MANAGERS,
  type PermissionAction,
  type PermissionConfirmationProps,
  type PermissionOption,
  type PostActionFunction,
} from "./oss/permissions";
export { PLUGIN_REMOTE_SYNC } from "./oss/remote-sync";
export {
  PLUGIN_REPLACEMENT,
  type SourceReplacementButtonChildProps,
  type SourceReplacementButtonProps,
  type SourceReplacementModalProps,
  type SourceReplacementTriggeredFrom,
} from "./oss/replacement";
export { PLUGIN_RESOURCE_DOWNLOADS } from "./oss/resource-downloads";
export { PLUGIN_SCHEMA_VIEWER } from "./oss/schema-viewer";
export {
  PLUGIN_SEMANTIC_SEARCH,
  type SearchSettingsWidgetProps,
} from "./oss/semantic-search";
export { PLUGIN_ADMIN_SETTINGS } from "./oss/settings";
export { PLUGIN_SMTP_OVERRIDE } from "./oss/smtp-override";
export {
  PLUGIN_SNIPPET_FOLDERS,
  type MoveSnippetModalProps,
  type SnippetCollectionPermissionsModalProps,
  type SnippetCollectionPickerModalProps,
  type SnippetSidebarContext,
  type SnippetSidebarMenuOption,
} from "./oss/snippets";
export {
  PLUGIN_TRANSFORMS,
  PLUGIN_TRANSFORMS_PYTHON,
  type TransformsPlugin,
  type PythonTransformEditorProps,
  type PythonTransformSourceSectionProps,
  type PythonTransformSourceValidationResult,
  type PythonTransformsPlugin,
} from "./oss/transforms";
export {
  PLUGIN_DEPENDENCIES,
  type DependencyGraphPageContextType,
} from "./oss/dependencies";
export { PLUGIN_MONITOR, PLUGIN_MONITOR_TOOLS } from "./oss/monitor";
export { PLUGIN_UPLOAD_MANAGEMENT } from "./oss/upload-management";
export { PLUGIN_WHITELABEL } from "./oss/whitelabel";
export {
  PLUGIN_WRITABLE_CONNECTION,
  type WritableConnectionInfoSectionProps,
} from "./oss/writable-connection";
export { PLUGIN_SECURITY_CENTER } from "./oss/security-center";
export { PLUGIN_AI_CONTROLS, type AiControlsPlugin } from "./oss/ai-controls";
export { PLUGIN_SUPPORT } from "./oss/support";
export { PLUGIN_TENANTS } from "./oss/tenants";

// Re-export types that are used by other files
export type {
  GetAuthProviders,
  GitSyncSetupMenuItemProps,
  PluginGroupManagersType,
  SyncedCollectionsSidebarSectionProps,
} from "./types";

import { reinitializeRequestHandlers } from "metabase/api/client";

import { resetPluginSlots } from "./slot";

/**
 * Mostly for test purposes, reinitialize all plugins.
 * You don't reinitialize plugins individually because some plugins depend on others,
 * so reinitializing them all ensures that dependencies are correctly set up.
 */
export function reinitialize() {
  resetPluginSlots();
  // metabase/api can't import metabase/plugins under the module rules, so its slot is reset by hand.
  // This is temporary: once plugins can sit below api, the slot uses definePluginSlot and this goes.
  reinitializeRequestHandlers();
}
