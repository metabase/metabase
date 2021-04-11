import MetabaseSettings from "metabase/lib/settings";

// SETTINGS OVERRIDES:

// NOTE: temporarily use "latest" for Enterprise Edition docs
MetabaseSettings.docsTag = () => "latest";
// NOTE: use the "enterprise" key from version-info.json
MetabaseSettings.versionInfo = () =>
  MetabaseSettings.get("version-info", {}).enterprise || {};
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
