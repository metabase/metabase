import { PLUGIN_IS_EE_BUILD } from "metabase/plugins";

// SETTINGS OVERRIDES:
PLUGIN_IS_EE_BUILD.isEEBuild = () => true;

import "./shared";

// PLUGINS:

import "./hosting";
import "./tools";
import "./sandboxes";
import "./auth";
import "./caching";
import "./collections";
import "./content_verification";
import "./whitelabel";
import "./embedding";
import "./embedding-sdk";
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
import "./resource_downloads";
import "./user_provisioning";
import "./clean_up";
import "./troubleshooting";
