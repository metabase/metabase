import { PLUGIN_IS_EE_BUILD } from "metabase/plugins";

// SETTINGS OVERRIDES:
const activateIsEEBuildPlugin = () => {
PLUGIN_IS_EE_BUILD.isEEBuild = () => true;
};

import "./shared";

// PLUGINS:

import * as hosting from "./hosting";
import * as tools from "./tools";
import * as sandboxes from "./sandboxes";
import * as auth from "./auth";
import * as caching from "./caching";
import * as collections from "./collections";
import * as content_verification from "./content_verification";
import * as whitelabel from "./whitelabel";
import * as embedding from "./embedding";
import * as sdk from "./embedding-sdk";
import * as snippets from "./snippets";
import * as sharing from "./sharing";
import * as moderation from "./moderation";
import * as email_allow_list from "./email_allow_list";
import * as email_restrict_recipients from "./email_restrict_recipients";
import * as advanced_permissions from "./advanced_permissions";
import * as audit_app from "./audit_app";
import * as license from "./license";
import * as model_persistence from "./model_persistence";
import * as feature_level_permissions from "./feature_level_permissions";
import * as application_permissions from "./application_permissions";
import * as group_managers from "./group_managers";
import * as llm_autodescription from "./llm_autodescription";
import * as upload_management from "./upload_management";
import * as resource_downloads from "./resource_downloads";
import * as user_provisioning from "./user_provisioning";
import * as clean_up from "./clean_up";
import * as troubleshooting from "./troubleshooting";

const eePluginActivators = [
  activateIsEEBuildPlugin,
  hosting.activate,
  tools.activate,
  sandboxes.activate,
  auth.activate,
  caching.activate,
  collections.activate,
  content_verification.activate,
  whitelabel.activate,
  embedding.activate,
  sdk.activate,
  snippets.activate,
  sharing.activate,
  moderation.activate,
  email_allow_list.activate,
  email_restrict_recipients.activate,
  advanced_permissions.activate,
  audit_app.activate,
  license.activate,
  model_persistence.activate,
  feature_level_permissions.activate,
  application_permissions.activate,
  group_managers.activate,
  llm_autodescription.activate,
  upload_management.activate,
  resource_downloads.activate,
  user_provisioning.activate,
  clean_up.activate,
  troubleshooting.activate,
];

const activateEEPlugins = () => {
  eePluginActivators.forEach(activate => activate());
};

activateEEPlugins();
