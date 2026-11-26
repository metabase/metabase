import type { ComponentType } from "react";
import { createElement, useEffect, useReducer } from "react";

// Not the barrel: it pulls the diagnostic modal, which closes an import cycle
// back onto the plugin slots this module helps build.
import { NotFound } from "metabase/common/components/ErrorPages/NotFound";
import { useHasTokenFeature } from "metabase/common/hooks/use-has-token-feature/use-has-token-feature";
import { notFoundRoute } from "metabase/plugins/components/PluginPlaceholder";
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

type Branch = "enabled" | "disabled";

/**
 * A lazy route that picks its page by a premium feature.
 *
 * The router resolves a route's `lazy` once per session, so the resolved
 * component makes the choice, not the loader: it subscribes to the feature and
 * follows it, which keeps a URL visited before a settings refresh consistent
 * with one visited after.
 *
 * The page the current state picks loads before the navigation commits, which
 * keeps `lazy`'s contract of not committing to a blank frame. The other page
 * is only fetched when the feature changes under an open session.
 *
 * Routes must mount unconditionally; this is the supported way for one of them
 * to depend on a feature.
 */
export function featureGatedRoute(
  feature: TokenFeature,
  enabled: PluginRoute,
  disabled: PluginRoute = notFoundRoute,
): FeatureGatedRoute {
  const loaders: Record<Branch, PluginRoute> = { enabled, disabled };
  const pages: Partial<Record<Branch, ComponentType>> = {};
  const loading: Partial<Record<Branch, Promise<void>>> = {};

  const load = (branch: Branch) =>
    (loading[branch] ??= loaders[branch]().then(({ Component }) => {
      pages[branch] = Component;
    }));

  function FeatureGated() {
    const branch: Branch = useHasTokenFeature(feature) ? "enabled" : "disabled";
    const [, pageArrived] = useReducer((count: number) => count + 1, 0);
    const Component = pages[branch];

    useEffect(() => {
      if (!pages[branch]) {
        load(branch).then(pageArrived);
      }
    }, [branch]);

    return Component ? createElement(Component) : null;
  }

  const route = async () => {
    await load(hasPremiumFeature(feature) ? "enabled" : "disabled");
    return { Component: FeatureGated };
  };

  return Object.assign(route, { gatedOn: feature, enabled, disabled });
}

export function isFeatureGatedRoute(
  loader: () => Promise<unknown>,
): loader is FeatureGatedRoute {
  return "gatedOn" in loader;
}

/**
 * A component that follows a premium feature, for route leaves that hold their
 * component eagerly, such as modal routes. Without the feature the route still
 * mounts and renders what an unknown URL gets.
 */
export function featureGatedComponent<Props extends object>(
  feature: TokenFeature,
  Enabled: ComponentType<Props>,
  Disabled: ComponentType = NotFound,
): ComponentType<Props> {
  return function FeatureGated(props: Props) {
    return useHasTokenFeature(feature)
      ? createElement(Enabled, props)
      : createElement(Disabled);
  };
}
