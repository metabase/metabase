import { PLUGIN_IS_EE_BUILD } from "metabase/plugins";

// SETTINGS OVERRIDES:
PLUGIN_IS_EE_BUILD.isEEBuild = () => true;

import "./shared";

// SDK PLUGINS:

import "./embedding";
import "./embedding-sdk";
import "./metabot";
