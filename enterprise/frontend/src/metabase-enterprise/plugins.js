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
