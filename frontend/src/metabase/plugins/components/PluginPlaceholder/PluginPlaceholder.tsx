import type { JSX } from "react";
import { Suspense, lazy } from "react";

import type { PluginRoute } from "metabase/plugins/types";
import { Navigate, Outlet, redirect } from "metabase/router";

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
 * A route that renders only its `Outlet`: a layout slot's stand-in, whichever
 * branch of a gate it fills.
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
 * The not-found page as a route: what an unknown URL gets, wherever a gate or
 * a slot needs that page as a branch.
 */
export const notFoundRoute: PluginRoute = async () => ({
  Component: NotFoundPlaceholder,
});

/**
 * A modal route slot's off state: leave for the page the modal would have
 * opened over. `replace` keeps the modal's URL out of the history, so the Back
 * button does not return to a URL that only leaves again.
 */
export function PluginPlaceholderModal() {
  return <Navigate to=".." replace relative="route" />;
}

/**
 * An index route's on state when it only forwards to a sibling.
 */
export const redirectRoute =
  (to: string): PluginRoute =>
  async () => ({ Component: () => redirect(to) });
