import { isEmbeddingSdk } from "metabase/env";
import MetabaseSettings from "metabase/lib/settings";
import { PLUGIN_IS_EE_BUILD } from "metabase/plugins";

import { activateAdvancedPermissionsPlugin } from "./advanced_permissions";
import { activateApplicationPermissionsPlugin } from "./application_permissions";
import { activateAuditAppPlugin } from "./audit_app";
import { activateAuthPlugin } from "./auth";
import { activateCachingPlugin } from "./caching";
import { activateCollectionCleanupPlugin } from "./clean_up";
import { activateCollectionsPlugin } from "./collections";
import { activateContentVerificationPlugin } from "./content_verification";
import { activateEmailAllowListPlugin } from "./email_allow_list";
import { activateEmailRestrictRecipientsPlugin } from "./email_restrict_recipients";
import { activateEmbeddingPlugin } from "./embedding";
import { activateFeatureLevelPermissionsPlugin } from "./feature_level_permissions";
import { activateGroupManagersPlugin } from "./group_managers";
import { activateHostingPlugin } from "./hosting";
import { activateLicensePlugin } from "./license";
import { activateLLMAutoDescriptionPlugin } from "./llm_autodescription";
import { activateModelPersistencePlugin } from "./model_persistence";
import { activateModerationPlugin } from "./moderation";
import { enableResourceDownloadsPlugin } from "./resource_downloads";
import { activateSandboxesPlugin } from "./sandboxes";
import { activateSharedPlugin } from "./shared";
import { activateSharingPlugin } from "./sharing";
import { activateSnippetsPlugin } from "./snippets";
import { activateToolsPlugin } from "./tools";
import { activateTroubleshootingPlugin } from "./troubleshooting";
import { activateUploadManagementPlugin } from "./upload_management";
import { activateUserProvisioningPlugin } from "./user_provisioning";
import { activateWhitelabelPlugins } from "./whitelabel";

// SETTINGS OVERRIDES:

// NOTE: temporarily use "latest" for Enterprise Edition docs
MetabaseSettings.docsTag = () => "latest";
PLUGIN_IS_EE_BUILD.isEEBuild = () => true;

export const activateEEPlugins = () => {
  activateWhitelabelPlugins();
  activateContentVerificationPlugin();
  activateCollectionsPlugin();
  enableResourceDownloadsPlugin();
  activateSharedPlugin();
  activateHostingPlugin();
  activateToolsPlugin();
  activateSandboxesPlugin();
  activateAuthPlugin();
  activateCachingPlugin();
  activateEmbeddingPlugin();
  activateSnippetsPlugin();
  activateSharingPlugin();
  activateModerationPlugin();
  activateEmailAllowListPlugin();
  activateEmailRestrictRecipientsPlugin();
  activateAdvancedPermissionsPlugin();
  activateAuditAppPlugin();
  activateLicensePlugin();
  activateModelPersistencePlugin();
  activateFeatureLevelPermissionsPlugin();
  activateApplicationPermissionsPlugin();
  activateGroupManagersPlugin();
  activateLLMAutoDescriptionPlugin();
  activateUploadManagementPlugin();
  activateUserProvisioningPlugin();
  activateCollectionCleanupPlugin();
  activateTroubleshootingPlugin();
};

if (!isEmbeddingSdk) {
  activateEEPlugins();
}
