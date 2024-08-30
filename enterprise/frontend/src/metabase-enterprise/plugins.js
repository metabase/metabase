import { isEmbeddingSdk } from "metabase/env";
import MetabaseSettings from "metabase/lib/settings";
import { PLUGIN_IS_EE_BUILD } from "metabase/plugins";

import { activateCollectionsPlugin } from "./collections";
import { activateContentVerificationPlugin } from "./content_verification";
import { enableResourceDownloadsPlugin } from "./resource_downloads";
import { activateWhitelabelPlugins } from "./whitelabel";

// SETTINGS OVERRIDES:

// NOTE: temporarily use "latest" for Enterprise Edition docs
MetabaseSettings.docsTag = () => "latest";
PLUGIN_IS_EE_BUILD.isEEBuild = () => true;

// PLUGINS:
import "./shared";
import "./hosting";
import "./tools";
import "./sandboxes";
import "./auth";
import "./caching";
import "./embedding";
import "./snippets";
import "./sharing";
import "./moderation";
import "./email_allow_list";
import "./email_restrict_recipients";
import "./advanced_permissions";
import "./audit_app";
import "./license";
import "./model_persistence";
import "./feature_level_permissions";
import "./application_permissions";
import "./group_managers";
import "./llm_autodescription";
import "./upload_management";
import "./user_provisioning";
import "./clean_up";
import "./troubleshooting";

// plugins with activate functions, so we can manually activate them for the sdk when we load the token-features

export const activateEEPlugins = () => {
  activateWhitelabelPlugins();
  activateContentVerificationPlugin();
  activateCollectionsPlugin();
  enableResourceDownloadsPlugin();
};

if (!isEmbeddingSdk) {
  activateEEPlugins();
}
