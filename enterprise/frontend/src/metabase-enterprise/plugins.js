import { PLUGIN_IS_EE_BUILD } from "metabase/plugins";

// SETTINGS OVERRIDES:
PLUGIN_IS_EE_BUILD.isEEBuild = () => true;

import "./shared";

// PLUGINS THAT DON'T USE hasPremiumFeature (imported immediately):
import "./license";

// PLUGINS THAT USE hasPremiumFeature (import initialization functions):
import { initializePlugin as initializeAdvancedPermissions } from "./advanced_permissions";
import { initializePlugin as initializeAiEntityAnalysis } from "./ai-entity-analysis";
import { initializePlugin as initializeAiSqlFixer } from "./ai-sql-fixer";
import { initializePlugin as initializeApplicationPermissions } from "./application_permissions";
import { initializePlugin as initializeAuditApp } from "./audit_app";
import { initializePlugin as initializeAuth } from "./auth";
import { initializePlugin as initializeCaching } from "./caching";
import { initializePlugin as initializeCleanUp } from "./clean_up";
import { initializePlugin as initializeCollections } from "./collections";
import { initializePlugin as initializeContentTranslation } from "./content_translation";
import { initializePlugin as initializeContentVerification } from "./content_verification";
import { initializePlugin as initializeLibrary } from "./data-studio/library";
import { initializePlugin as initializeDatabaseReplication } from "./database_replication";
import { initializePlugin as initializeDatabaseRouting } from "./database_routing";
import { initializePlugin as initializeDependencies } from "./dependencies";
import { initializePlugin as initializeEmbedding } from "./embedding";
import { initializePlugin as initializeEmbeddingSdk } from "./embedding-sdk";
import { initializePlugin as initializeEmbeddingIframeSdk } from "./embedding_iframe_sdk";
import { initializePlugin as initializeEmbeddingIframeSdkSetup } from "./embedding_iframe_sdk_setup";
import { initializePlugin as initializeFeatureLevelPermissions } from "./feature_level_permissions";
import { initializePlugin as initializeGroupManagers } from "./group_managers";
import { initializePlugin as initializeMetabot } from "./metabot";
import { initializePlugin as initializeModelPersistence } from "./model_persistence";
import { initializePlugin as initializeModeration } from "./moderation";
import { initializePlugin as initializeRemoteSync } from "./remote_sync";
import { initializePlugin as initializeResourceDownloads } from "./resource_downloads";
import { initializePlugin as initializeSandboxes } from "./sandboxes";
import { initializePlugin as initializeSemanticSearch } from "./semantic_search";
import { initializePlugin as initializeSharing } from "./sharing";
import { initializePlugin as initializeSmtpOverride } from "./smtp-override";
import { initializePlugin as initializeSnippets } from "./snippets";
import { initializePlugin as initializeSupport } from "./support";
import { initializePlugin as initializeTableEditing } from "./table-editing";
import { initializePlugin as initializeTenants } from "./tenants";
import { initializePlugin as initializeTools } from "./tools";
import { initializePlugin as initializeTransformsPython } from "./transforms-python";
import { initializePlugin as initializeUploadManagement } from "./upload_management";
import { initializePlugin as initializeUserProvisioning } from "./user_provisioning";
import { initializePlugin as initializeWhitelabel } from "./whitelabel";

/**
 * Initialize all enterprise plugins that use hasPremiumFeature.
 * Must be called after token features are available.
 */
export function initializePlugins() {
  initializeTools();
  initializeSandboxes();
  initializeAuth();
  initializeCaching();
  initializeCollections();
  initializeContentTranslation();
  initializeContentVerification();
  initializeDatabaseRouting();
  initializeRemoteSync();
  initializeWhitelabel();
  initializeEmbedding();
  initializeEmbeddingSdk();
  initializeEmbeddingIframeSdk();
  initializeEmbeddingIframeSdkSetup();
  initializeSnippets();
  initializeSmtpOverride();
  initializeSharing();
  initializeModeration();
  initializeAdvancedPermissions();
  initializeAiSqlFixer();
  initializeAiEntityAnalysis();
  initializeAuditApp();
  initializeModelPersistence();
  initializeFeatureLevelPermissions();
  initializeApplicationPermissions();
  initializeGroupManagers();
  initializeLibrary();
  initializeUploadManagement();
  initializeResourceDownloads();
  initializeUserProvisioning();
  initializeCleanUp();
  initializeMetabot();
  initializeDatabaseReplication();
  initializeTableEditing();
  initializeDependencies();
  initializeSemanticSearch();
  initializeTransformsPython();
  initializeSupport();
  initializeTenants?.();
}
