import MetabaseSettings from "metabase/lib/settings";

// SETTINGS OVERRIDES:

// NOTE: temporarily use "latest" for Enterprise Edition docs
MetabaseSettings.docsTag = () => "latest";
MetabaseSettings.isEnterprise = () => true;
// PLUGINS:

// import "./management";

import "./audit_app";
import "./sandboxes";
import "./auth";
import "./whitelabel";
import "./embedding";
import "./store";
import "./snippets";
import "./sharing";
import "./moderation";
