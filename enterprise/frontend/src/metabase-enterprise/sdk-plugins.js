import { PLUGIN_IS_EE_BUILD } from "metabase/plugins";

import { initializeSdkPlugins } from "./whitelabel/sdk-overrides";

// SETTINGS OVERRIDES:
PLUGIN_IS_EE_BUILD.isEEBuild = () => true;

import "./shared";

// SDK PLUGINS:

import "./embedding";
import "./embedding-sdk";
import "./metabot";

initializeSdkPlugins();

// "SDK EE-plugins", that are specific to the embedding sdk.
// These only apply to the SDK, not to the core app
import "../embedding-sdk-ee/auth";
import "../embedding-sdk-ee/metabot";
