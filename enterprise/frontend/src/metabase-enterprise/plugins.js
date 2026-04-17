import { PLUGIN_IS_EE_BUILD } from "metabase/plugins";

// SETTINGS OVERRIDES:
PLUGIN_IS_EE_BUILD.isEEBuild = () => true;

import "./shared";

// PLUGINS:

import "./tools";
import "./sandboxes";
import "./auth";
import "./caching";
import "./collections";
import "./content_translation";
import "./content_verification";
import "./database_routing";
import "./remote_sync";
import "./whitelabel";
import "./embedding";
import "./embedding-sdk";
import "./embedding_iframe_sdk_setup";
import "./snippets";
import "./smtp-override";
import "./sharing";
import "./moderation";
import "./advanced_permissions";
import "./ai-sql-fixer";
import "./ai-entity-analysis";
import "./audit_app";
import "./license";
<<<<<<< HEAD
import "./model_persistence";
import "./feature_level_permissions";
import "./application_permissions";
import "./group_managers";
import "./upload_management";
import "./resource_downloads";
import "./user_provisioning";
import "./clean_up";
import "./metabot";
import "./database_replication";
import "./table-editing";
import "./dependencies";
import "./documents";
import "./semantic_search";
import "./transforms";
import "./transforms-python";
import "./public-sharing";
=======

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
import { initializePlugin as initializeDataStudio } from "./data-studio";
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
import { initializePlugin as initializeSecurityCenter } from "./security_center";
import { initializePlugin as initializeSemanticSearch } from "./semantic_search";
import { initializePlugin as initializeSharing } from "./sharing";
import { initializePlugin as initializeSmtpOverride } from "./smtp-override";
import { initializePlugin as initializeSnippets } from "./snippets";
import { initializePlugin as initializeSupport } from "./support";
import { initializePlugin as initializeTableEditing } from "./table-editing";
import { initializePlugin as initializeTenants } from "./tenants";
import { initializePlugin as initializeTools } from "./tools";
import { initializePlugin as initializeTransforms } from "./transforms";
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
  initializeDataStudio();
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
  initializeUploadManagement();
  initializeResourceDownloads();
  initializeUserProvisioning();
  initializeCleanUp();
  initializeMetabot();
  initializeDatabaseReplication();
  initializeTableEditing();
  initializeDependencies();
  initializeSecurityCenter();
  initializeSemanticSearch();
  initializeTransforms();
  initializeTransformsPython();
  initializeSupport();
  initializeTenants?.();
}
>>>>>>> be93a0bddc3 (🤖 backported "Security Center" (#72346) (#72700))
