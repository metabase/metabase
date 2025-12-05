import { PLUGIN_IS_EE_BUILD } from "metabase/plugins";

// SETTINGS OVERRIDES:
PLUGIN_IS_EE_BUILD.isEEBuild = () => true;

import "./shared";

// CORE APP PLUGINS THAT USE hasPremiumFeature (import initialization functions):
import { initializePlugin as initializeEmbedding } from "./embedding";
import { initializePlugin as initializeEmbeddingSdk } from "./embedding-sdk";
import { initializePlugin as initializeMetabot } from "./metabot";
import { initializePlugin as initializeTenants } from "./tenants";
import { initializePlugin as initializeWhitelabelPlugin } from "./whitelabel";
import { initializePlugin as initializeWhitelabelOverridePlugin } from "./whitelabel/sdk-overrides";

/**
 * Initialize all SDK enterprise plugins that use hasPremiumFeature.
 * Must be called after token features are available.
 */
export function initializePlugins() {
  initializeEmbedding?.();
  initializeEmbeddingSdk?.();
  initializeMetabot?.();
  initializeTenants?.();
  initializeWhitelabelPlugin?.();
  initializeWhitelabelOverridePlugin?.();
}

// "SDK EE-plugins", that are specific to the embedding sdk.
// These only apply to the SDK, not to the core app
import "../embedding-sdk-ee/auth";
import "../embedding-sdk-ee/metabot";
