// oxfmt-ignore
import { PLUGIN_IS_EE_BUILD } from "metabase/plugins";

// oxfmt-ignore
import { initializeSdkCustomVizPlugin } from "../embedding-sdk-ee/custom-viz/initialize";
// oxfmt-ignore
import { initializeHandleLinkPlugin } from "../embedding-sdk-ee/handle-link/handle-link";

// SETTINGS OVERRIDES:
PLUGIN_IS_EE_BUILD.isEEBuild = () => true;

// oxfmt-ignore
import "./shared";

// CORE APP PLUGINS THAT USE hasPremiumFeature (import initialization functions):
// oxfmt-ignore
import { initializePlugin as initializeContentTranslation } from "./content_translation";
// oxfmt-ignore
import { initializePlugin as initializeEmbedding } from "./embedding";
// oxfmt-ignore
import { initializePlugin as initializeEmbeddingSdk } from "./embedding-sdk";
// oxfmt-ignore
import { initializePlugin as initializeSharing } from "./sharing";
// oxfmt-ignore
import { initializePlugin as initializeTenants } from "./tenants";
// oxfmt-ignore
import { initializePlugin as initializeWhitelabelPlugin } from "./whitelabel";
// oxfmt-ignore
import { initializePlugin as initializeWhitelabelOverridePlugin } from "./whitelabel/sdk-overrides";

// oxfmt-ignore
import { initializePlugin as initializeNotifications } from "../embedding-sdk-ee/notifications";

/**
 * Initialize all SDK enterprise plugins that use hasPremiumFeature.
 * Must be called after token features are available.
 */
export function initializePlugins() {
  initializeEmbedding?.();
  initializeEmbeddingSdk?.();
  initializeTenants?.();
  initializeWhitelabelPlugin?.();
  initializeWhitelabelOverridePlugin?.();
  initializeContentTranslation?.();
  initializeNotifications();
  initializeSharing();
  initializeHandleLinkPlugin();
  initializeSdkCustomVizPlugin();
}

// "SDK EE-plugins", that are specific to the embedding sdk.
// These only apply to the SDK, not to the core app
// oxfmt-ignore
import "../embedding-sdk-ee/auth";
// oxfmt-ignore
import "../embedding-sdk-ee/metabot";
