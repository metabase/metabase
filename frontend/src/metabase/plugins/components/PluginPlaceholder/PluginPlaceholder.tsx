import { Suspense, lazy } from "react";

import type { PluginRoute } from "metabase/plugins/types";
import { Outlet, redirect } from "metabase/router";

interface Props {
  [key: string]: any;
}

export function PluginPlaceholder<T = Props>(_props: T): JSX.Element | null {
  return null;
}

/**
 * The route equivalent of PluginPlaceholder, for a route slot that no plugin
 * filled in.
 */
export const pluginPlaceholderRoute: PluginRoute = async () => ({
  Component: PluginPlaceholder,
});

/**
 * A pathless layout's off state: render the children without the chrome.
 */
export const outletRoute: PluginRoute = async () => ({ Component: Outlet });

const LazyNotFound = lazy(() =>
  import("metabase/common/components/ErrorPages").then(({ NotFound }) => ({
    default: NotFound,
  })),
);

/**
 * The page an unknown URL gets. The error pages reach the plugin slots again
 * through the app selectors, so the plugins read them out of a chunk instead of
 * an import that would close that cycle while the slots are still being built.
 */
export function NotFoundPlaceholder() {
  return (
    <Suspense fallback={null}>
      <LazyNotFound />
    </Suspense>
  );
}

/**
 * A gated route's off state when there is nothing to upsell: the same page an
 * unknown URL gets.
 */
export const notFoundRoute: PluginRoute = async () => ({
  Component: NotFoundPlaceholder,
});

/**
 * An index route's on state when it only forwards to a sibling.
 */
export const redirectRoute =
  (to: string): PluginRoute =>
  async () => ({ Component: () => redirect(to) });
