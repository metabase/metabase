/* eslint-disable import/order */
import { PLUGIN_IS_EE_BUILD } from "metabase/plugins";

import { initializeHandleLinkPlugin } from "../embedding-sdk-ee/handle-link/handle-link";

// SETTINGS OVERRIDES:
PLUGIN_IS_EE_BUILD.isEEBuild = () => true;

import "./shared";

// CORE APP PLUGINS THAT USE hasPremiumFeature (import initialization functions):
import { initializePlugin as initializeContentTranslation } from "./content_translation";
import { initializePlugin as initializeEmbedding } from "./embedding";
import { initializePlugin as initializeEmbeddingSdk } from "./embedding-sdk";
import { initializePlugin as initializeSharing } from "./sharing";
import { initializePlugin as initializeTenants } from "./tenants";
import { initializePlugin as initializeWhitelabelPlugin } from "./whitelabel";
import { initializePlugin as initializeWhitelabelOverridePlugin } from "./whitelabel/sdk-overrides";

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
}

// "SDK EE-plugins", that are specific to the embedding sdk.
// These only apply to the SDK, not to the core app
import "../embedding-sdk-ee/auth";
import "../embedding-sdk-ee/metabot";
