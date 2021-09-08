import MetabaseSettings from "metabase/lib/settings";

// SETTINGS OVERRIDES:

// NOTE: temporarily use "latest" for Enterprise Edition docs
MetabaseSettings.docsTag = () => "latest";
MetabaseSettings.isEnterprise = () => true;
// PLUGINS:

// import "./management";

import "./audit_app";
import "./auth";
import "./collections";
import "./embedding";
import "./moderation";
import "./notifications";
import "./sandboxes";
import "./sharing";
import "./snippets";
import "./store";
import "./whitelabel";
