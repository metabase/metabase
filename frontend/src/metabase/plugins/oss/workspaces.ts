import type { ComponentType } from "react";

import {
  NotFoundPlaceholder,
  PluginPlaceholder,
} from "metabase/plugins/components/PluginPlaceholder";

type WorkspacesPlugin = {
  WorkspacesSetupPage: ComponentType;
  WorkspacesTableRemappingsPage: ComponentType;
  WorkspacesNav: ComponentType;
};

const getDefaultPlugin = (): WorkspacesPlugin => ({
  WorkspacesSetupPage: NotFoundPlaceholder,
  WorkspacesTableRemappingsPage: NotFoundPlaceholder,
  WorkspacesNav: PluginPlaceholder,
});

export const PLUGIN_WORKSPACES = getDefaultPlugin();

/**
 * @internal Do not call directly. Use the main reinitialize function from metabase/plugins instead.
 */
export function reinitialize() {
  Object.assign(PLUGIN_WORKSPACES, getDefaultPlugin());
}
