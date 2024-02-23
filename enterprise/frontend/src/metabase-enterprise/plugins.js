import MetabaseSettings from "metabase/lib/settings";

// SETTINGS OVERRIDES:

// NOTE: temporarily use "latest" for Enterprise Edition docs
MetabaseSettings.docsTag = () => "latest";
MetabaseSettings.isEnterprise = () => true;

import "./shared";

// PLUGINS:

import "./tools";
import "./sandboxes";
import "./auth";
import "./caching";
import "./collections";
import "./whitelabel";
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
