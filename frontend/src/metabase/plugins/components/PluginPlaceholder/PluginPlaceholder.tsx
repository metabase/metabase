import { NotFound } from "metabase/common/components/ErrorPages";
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

/**
 * A gated route's off state when there is nothing to upsell: the same page an
 * unknown URL gets.
 */
export const notFoundRoute: PluginRoute = async () => ({ Component: NotFound });

/**
 * An index route's on state when it only forwards to a sibling.
 */
export const redirectRoute =
  (to: string): PluginRoute =>
  async () => ({ Component: () => redirect(to) });
