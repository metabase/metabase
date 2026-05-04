// Re-export all plugins from OSS modules (excluding reinitialize functions to avoid conflicts)
export { PLUGIN_API } from "./oss/api";
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
  type InvalidateNowButtonProps,
  type SidebarCacheSectionProps,
  type SidebarCacheFormProps,
  type PreemptiveCachingSwitchProps,
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
  PLUGIN_CONTENT_VERIFICATION,
  type ModelFilterControlsProps,
  type ModelFilterSettings,
  type MetricFilterControlsProps,
  type MetricFilterSettings,
} from "./oss/content-verification";
export {
  PLUGIN_APP_INIT_FUNCTIONS,
  PLUGIN_LANDING_PAGE,
  PLUGIN_REDUX_MIDDLEWARES,
  PLUGIN_LOGO_ICON_COMPONENTS,
  PLUGIN_ADMIN_ALLOWED_PATH_GETTERS,
  PLUGIN_ADMIN_TOOLS,
  PLUGIN_SELECTORS,
  PLUGIN_FORM_WIDGETS,
  PLUGIN_SNIPPET_SIDEBAR_PLUS_MENU_OPTIONS,
  PLUGIN_SNIPPET_SIDEBAR_ROW_RENDERERS,
  PLUGIN_SNIPPET_SIDEBAR_MODALS,
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
export { PLUGIN_EMBEDDING, type SimpleDataPickerProps } from "./oss/embedding";
export { PLUGIN_EMBEDDING_IFRAME_SDK } from "./oss/embedding-iframe-sdk";
export {
  PLUGIN_EMBEDDING_IFRAME_SDK_SETUP,
  type SdkIframeEmbedSetupModalProps,
  type SdkIframeEmbedSetupModalInitialState,
} from "./oss/embedding-iframe-sdk-setup";
export { PLUGIN_EMBEDDING_SDK } from "./oss/embedding-sdk";
export { PLUGIN_ENTITIES } from "./oss/entities";
export {
  PLUGIN_LIBRARY,
  type CreateLibraryModalProps,
  type PublishTablesModalProps,
  type UnpublishTablesModalProps,
} from "./oss/library";
export { PLUGIN_METABOT } from "./oss/metabot";
export { PLUGIN_MODEL_PERSISTENCE } from "./oss/model-persistence";
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
} from "./oss/permissions";
export { PLUGIN_REMOTE_SYNC } from "./oss/remote-sync";
export {
  PLUGIN_REPLACEMENT,
  type SourceReplacementButtonChildProps,
  type SourceReplacementButtonProps,
  type SourceReplacementModalProps,
} from "./oss/replacement";
export { PLUGIN_RESOURCE_DOWNLOADS } from "./oss/resource-downloads";
export {
  PLUGIN_SEMANTIC_SEARCH,
  type SearchSettingsWidgetProps,
} from "./oss/semantic-search";
export { PLUGIN_ADMIN_SETTINGS } from "./oss/settings";
export { PLUGIN_SMTP_OVERRIDE } from "./oss/smtp-override";
export {
  PLUGIN_SNIPPET_FOLDERS,
  type MoveSnippetModalProps,
  type SnippetFormModalProps,
  type SnippetCollectionMenuProps,
  type SnippetCollectionPermissionsModalProps,
  type SnippetCollectionPickerModalProps,
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
  type CheckDependenciesFormProps,
  type CheckDependenciesModalProps,
  type UseCheckDependenciesProps,
  type UseCheckDependenciesResult,
} from "./oss/dependencies";
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
export { PLUGIN_WORKSPACES } from "./oss/workspaces";

// Re-export types that are used by other files
export type {
  GetAuthProviders,
  GitSyncSetupMenuItemProps,
  PluginGroupManagersType,
  SyncedCollectionsSidebarSectionProps,
} from "./types";

// Export a single reinitialize function that calls all individual reinitialize functions
import { reinitialize as reinitializeNotificationsSdk } from "../../embedding-sdk-bundle/components/public/notifications";

import { reinitialize as reinitializeAiControls } from "./oss/ai-controls";
import { reinitialize as reinitializeApi } from "./oss/api";
import { reinitialize as reinitializeAudit } from "./oss/audit";
import { reinitialize as reinitializeAuth } from "./oss/auth";
import { reinitialize as reinitializeCaching } from "./oss/caching";
import { reinitialize as reinitializeCollections } from "./oss/collections";
import { reinitialize as reinitializeContentTranslation } from "./oss/content-translation";
import { reinitialize as reinitializeContentVerification } from "./oss/content-verification";
import { reinitialize as reinitializeCore } from "./oss/core";
import { reinitialize as reinitializeDatabase } from "./oss/database";
import { reinitialize as reinitializeDependencies } from "./oss/dependencies";
import { reinitialize as reinitializeEmbedding } from "./oss/embedding";
import { reinitialize as reinitializeEmbeddingIframeSdk } from "./oss/embedding-iframe-sdk";
import { reinitialize as reinitializeEmbeddingIframeSdkSetup } from "./oss/embedding-iframe-sdk-setup";
import { reinitialize as reinitializeEmbeddingSdk } from "./oss/embedding-sdk";
import { reinitialize as reinitializeEntities } from "./oss/entities";
import { reinitialize as reinitializeLibrary } from "./oss/library";
import { reinitialize as reinitializeMetabot } from "./oss/metabot";
import { reinitialize as reinitializeModelPersistence } from "./oss/model-persistence";
import { reinitialize as reinitializeModeration } from "./oss/moderation";
import { reinitialize as reinitializePermissions } from "./oss/permissions";
import { reinitialize as reinitializeRemoteSync } from "./oss/remote-sync";
import { reinitialize as reinitializeReplacement } from "./oss/replacement";
import { reinitialize as reinitializeResourceDownloads } from "./oss/resource-downloads";
import { reinitialize as reinitializeSecurityCenter } from "./oss/security-center";
import { reinitialize as reinitializeSemanticSearch } from "./oss/semantic-search";
import { reinitialize as reinitializeSettings } from "./oss/settings";
import { reinitialize as reinitializeSmtpOverride } from "./oss/smtp-override";
import { reinitialize as reinitializeSnippets } from "./oss/snippets";
import { reinitialize as reinitializeSupport } from "./oss/support";
import { reinitialize as reinitializeTenants } from "./oss/tenants";
import { reinitialize as reinitializeTransforms } from "./oss/transforms";
import { reinitialize as reinitializeUploadManagement } from "./oss/upload-management";
import { reinitialize as reinitializeWhitelabel } from "./oss/whitelabel";
import { reinitialize as reinitializeWorkspaces } from "./oss/workspaces";
import { reinitialize as reinitializeWritableConnection } from "./oss/writable-connection";
/**
 * Mostly for test purposes, reinitialize all plugins.
 * You don't reinitialize plugins individually because some plugins depend on others,
 * so reinitializing them all ensures that dependencies are correctly set up.
 */
export function reinitialize() {
  reinitializeNotificationsSdk();

  reinitializeAiControls();
  reinitializeApi();
  reinitializeAudit();
  reinitializeAuth();
  reinitializeCaching();
  reinitializeCollections();
  reinitializeContentTranslation();
  reinitializeContentVerification();
  reinitializeCore();
  reinitializeDatabase();
  reinitializeEmbedding();
  reinitializeEmbeddingIframeSdk();
  reinitializeEmbeddingIframeSdkSetup();
  reinitializeEmbeddingSdk();
  reinitializeEntities();
  reinitializeLibrary();
  reinitializeMetabot();
  reinitializeModelPersistence();
  reinitializeModeration();
  reinitializePermissions();
  reinitializeRemoteSync();
  reinitializeReplacement();
  reinitializeResourceDownloads();
  reinitializeSecurityCenter();
  reinitializeSemanticSearch();
  reinitializeSettings();
  reinitializeSmtpOverride();
  reinitializeSnippets();
  reinitializeSupport();
  reinitializeTenants();
  reinitializeDependencies();
  reinitializeTransforms();
  reinitializeUploadManagement();
  reinitializeWhitelabel();
  reinitializeWorkspaces();
  reinitializeWritableConnection();
}
