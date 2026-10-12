import type { PluginRoute } from "metabase/plugins/types";
import type { TokenFeature } from "metabase-types/api";

import { hasPremiumFeature } from "./index";

/**
 * A lazy route whose page follows a premium feature, carrying both branches so
 * tooling can reach the pages without deciding the feature.
 */
export interface FeatureGatedRoute extends PluginRoute {
  gatedOn: TokenFeature;
  enabled: PluginRoute;
  disabled: PluginRoute;
}

/**
 * A lazy route that picks its page by a premium feature.
 *
 * The feature is read when the route is navigated to, not when the tree is
 * built, so the tree stays identical on every instance and only the rendered
 * page differs. Routes must mount unconditionally; this is the supported way
 * for one of them to depend on a feature.
 */
export function featureGatedRoute(
  feature: TokenFeature,
  enabled: PluginRoute,
  disabled: PluginRoute,
): FeatureGatedRoute {
  const route = () => (hasPremiumFeature(feature) ? enabled() : disabled());

  return Object.assign(route, { gatedOn: feature, enabled, disabled });
}

export function isFeatureGatedRoute(
  loader: () => Promise<unknown>,
): loader is FeatureGatedRoute {
  return "gatedOn" in loader;
}
