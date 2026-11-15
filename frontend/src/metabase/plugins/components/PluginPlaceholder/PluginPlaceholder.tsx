import type { JSX } from "react";

import type { PluginRoute } from "metabase/plugins/types";

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
