import { PLUGIN_IS_EE_BUILD } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";
import type { TokenFeature } from "metabase-types/api";

// SETTINGS OVERRIDES:
PLUGIN_IS_EE_BUILD.isEEBuild = () => true;

import "./shared";

// PLUGINS THAT DON'T USE hasPremiumFeature (imported immediately):
import "./license";

import { initializePlugin as initializeAiControls } from "./ai-controls";
import { initializePlugin as initializeAuth } from "./auth";
import { initializePlugin as initializeEmbedding } from "./embedding";
import { initializePlugin as initializeMultiFactorAuth } from "./multi_factor_auth";
import pluginFeaturesJson from "./plugin-features.json";
import { initializePlugin as initializeResourceDownloads } from "./resource_downloads";
import { initializePlugin as initializeTransforms } from "./transforms";
import { initializePlugin as initializeTransformsInspector } from "./transforms-inspector";
import { initializePlugin as initializeTransformsPython } from "./transforms-python";

type PluginModule = { initializePlugin?: () => void };

type GatedPluginName = keyof typeof pluginFeaturesJson;

/**
 * The token features that make each remaining plugin worth loading: it loads
 * when any of them is enabled. The server reads the same file to preload the
 * chunks of the plugins an instance will load.
 */
// JSON imports widen string literals to `string`. plugins.unit.spec.ts checks
// every name against the plugin's own `hasPremiumFeature` calls.
const PLUGIN_FEATURES = pluginFeaturesJson as Record<
  GatedPluginName,
  TokenFeature[]
>;

// Each chunk name is unique, so no two plugins share a chunk. The build reads
// these names to list the files each plugin needs.
const LOAD_GATED_PLUGIN: Record<GatedPluginName, () => Promise<PluginModule>> =
  {
    advanced_permissions: () =>
      import(
        /* webpackChunkName: "ee-plugin-advanced_permissions" */ "./advanced_permissions"
      ),
    application_permissions: () =>
      import(
        /* webpackChunkName: "ee-plugin-application_permissions" */ "./application_permissions"
      ),
    audit_app: () =>
      import(/* webpackChunkName: "ee-plugin-audit_app" */ "./audit_app"),
    caching: () =>
      import(/* webpackChunkName: "ee-plugin-caching" */ "./caching"),
    clean_up: () =>
      import(/* webpackChunkName: "ee-plugin-clean_up" */ "./clean_up"),
    collections: () =>
      import(/* webpackChunkName: "ee-plugin-collections" */ "./collections"),
    content_translation: () =>
      import(
        /* webpackChunkName: "ee-plugin-content_translation" */ "./content_translation"
      ),
    content_verification: () =>
      import(
        /* webpackChunkName: "ee-plugin-content_verification" */ "./content_verification"
      ),
    custom_viz: () =>
      import(/* webpackChunkName: "ee-plugin-custom_viz" */ "./custom_viz"),
    "data-studio/library": () =>
      import(
        /* webpackChunkName: "ee-plugin-data-studio-library" */ "./data-studio/library"
      ),
    data_apps: () =>
      import(/* webpackChunkName: "ee-plugin-data_apps" */ "./data_apps"),
    database_replication: () =>
      import(
        /* webpackChunkName: "ee-plugin-database_replication" */ "./database_replication"
      ),
    database_routing: () =>
      import(
        /* webpackChunkName: "ee-plugin-database_routing" */ "./database_routing"
      ),
    dependencies: () =>
      import(/* webpackChunkName: "ee-plugin-dependencies" */ "./dependencies"),
    "embedding-sdk": () =>
      import(
        /* webpackChunkName: "ee-plugin-embedding-sdk" */ "./embedding-sdk"
      ),
    embedding_iframe_sdk: () =>
      import(
        /* webpackChunkName: "ee-plugin-embedding_iframe_sdk" */ "./embedding_iframe_sdk"
      ),
    embedding_iframe_sdk_setup: () =>
      import(
        /* webpackChunkName: "ee-plugin-embedding_iframe_sdk_setup" */ "./embedding_iframe_sdk_setup"
      ),
    feature_level_permissions: () =>
      import(
        /* webpackChunkName: "ee-plugin-feature_level_permissions" */ "./feature_level_permissions"
      ),
    group_managers: () =>
      import(
        /* webpackChunkName: "ee-plugin-group_managers" */ "./group_managers"
      ),
    metabot: () =>
      import(/* webpackChunkName: "ee-plugin-metabot" */ "./metabot"),
    model_persistence: () =>
      import(
        /* webpackChunkName: "ee-plugin-model_persistence" */ "./model_persistence"
      ),
    moderation: () =>
      import(/* webpackChunkName: "ee-plugin-moderation" */ "./moderation"),
    "monitor/dependency-diagnostics": () =>
      import(
        /* webpackChunkName: "ee-plugin-monitor-dependency-diagnostics" */ "./monitor/dependency-diagnostics"
      ),
    "monitor/tools": () =>
      import(
        /* webpackChunkName: "ee-plugin-monitor-tools" */ "./monitor/tools"
      ),
    remote_sync: () =>
      import(/* webpackChunkName: "ee-plugin-remote_sync" */ "./remote_sync"),
    replacement: () =>
      import(/* webpackChunkName: "ee-plugin-replacement" */ "./replacement"),
    sandboxes: () =>
      import(/* webpackChunkName: "ee-plugin-sandboxes" */ "./sandboxes"),
    schema_viewer: () =>
      import(
        /* webpackChunkName: "ee-plugin-schema_viewer" */ "./schema_viewer"
      ),
    security_center: () =>
      import(
        /* webpackChunkName: "ee-plugin-security_center" */ "./security_center"
      ),
    semantic_search: () =>
      import(
        /* webpackChunkName: "ee-plugin-semantic_search" */ "./semantic_search"
      ),
    sharing: () =>
      import(/* webpackChunkName: "ee-plugin-sharing" */ "./sharing"),
    "smtp-override": () =>
      import(
        /* webpackChunkName: "ee-plugin-smtp-override" */ "./smtp-override"
      ),
    snippets: () =>
      import(/* webpackChunkName: "ee-plugin-snippets" */ "./snippets"),
    support: () =>
      import(/* webpackChunkName: "ee-plugin-support" */ "./support"),
    "table-editing": () =>
      import(
        /* webpackChunkName: "ee-plugin-table-editing" */ "./table-editing"
      ),
    tenants: () =>
      import(/* webpackChunkName: "ee-plugin-tenants" */ "./tenants"),
    upload_management: () =>
      import(
        /* webpackChunkName: "ee-plugin-upload_management" */ "./upload_management"
      ),
    user_provisioning: () =>
      import(
        /* webpackChunkName: "ee-plugin-user_provisioning" */ "./user_provisioning"
      ),
    whitelabel: () =>
      import(/* webpackChunkName: "ee-plugin-whitelabel" */ "./whitelabel"),
    writable_connection: () =>
      import(
        /* webpackChunkName: "ee-plugin-writable_connection" */ "./writable_connection"
      ),
  };

/**
 * The order plugins initialize in, which is the order they initialized in
 * before any of them loaded on demand. Some plugins read slots others fill.
 *
 * A plugin that loads on every instance appears as its initializer. Those
 * do work while their feature is off, such as showing an upsell, or when
 * their module is first evaluated.
 */
const PLUGIN_ORDER: (GatedPluginName | (() => void))[] = [
  "advanced_permissions",
  initializeAiControls,
  "application_permissions",
  "audit_app",
  initializeAuth,
  "caching",
  "clean_up",
  "collections",
  "content_translation",
  "content_verification",
  "custom_viz",
  "data_apps",
  "database_replication",
  "database_routing",
  "dependencies",
  initializeEmbedding,
  "embedding_iframe_sdk",
  "embedding_iframe_sdk_setup",
  "embedding-sdk",
  "feature_level_permissions",
  "group_managers",
  "data-studio/library",
  "metabot",
  "model_persistence",
  "moderation",
  "monitor/dependency-diagnostics",
  initializeMultiFactorAuth,
  "remote_sync",
  "replacement",
  initializeResourceDownloads,
  "sandboxes",
  "schema_viewer",
  "security_center",
  "semantic_search",
  "sharing",
  "smtp-override",
  "snippets",
  "support",
  "table-editing",
  "tenants",
  "monitor/tools",
  initializeTransforms,
  initializeTransformsInspector,
  initializeTransformsPython,
  "upload_management",
  "user_provisioning",
  "whitelabel",
  "writable_connection",
];

function isGatedPlugin(
  entry: GatedPluginName | (() => void),
): entry is GatedPluginName {
  return typeof entry === "string";
}

function initializeInOrder(
  getGatedPlugin: (name: GatedPluginName) => PluginModule | undefined,
) {
  for (const entry of PLUGIN_ORDER) {
    if (isGatedPlugin(entry)) {
      getGatedPlugin(entry)?.initializePlugin?.();
    } else {
      entry();
    }
  }
}

async function loadGatedPlugin(name: GatedPluginName) {
  try {
    return await LOAD_GATED_PLUGIN[name]();
  } catch (error) {
    // The app still renders, with this plugin's slots on their OSS defaults.
    console.error(`Could not load the ${name} enterprise plugin`, error);
    return undefined;
  }
}

/**
 * Load the plugins this instance's token enables, then initialize every
 * plugin in order. Must be called after token features are available, and
 * awaited before anything reads a plugin slot.
 */
export async function initializePlugins() {
  const enabled = PLUGIN_ORDER.filter(isGatedPlugin).filter((name) =>
    PLUGIN_FEATURES[name].some((feature) => hasPremiumFeature(feature)),
  );
  const loaded = new Map(
    await Promise.all(
      enabled.map(async (name) => [name, await loadGatedPlugin(name)] as const),
    ),
  );
  initializeInOrder((name) => loaded.get(name));
}

/**
 * Initialize every plugin whatever the token, taking each module from
 * `requirePlugin`. Tests use it to render straight afterwards, and each plugin
 * still checks the token features the test mocks.
 */
export function initializePluginsSync(
  requirePlugin: (name: GatedPluginName) => PluginModule,
) {
  initializeInOrder(requirePlugin);
}
