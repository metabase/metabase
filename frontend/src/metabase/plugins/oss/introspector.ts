import type { ComponentType } from "react";

import { PluginPlaceholder } from "metabase/plugins/components/PluginPlaceholder";

type IntrospectorNavItemProps = {
  currentPath: string;
};

type IntrospectorPlugin = {
  isEnabled: boolean;
  IntrospectorPage: ComponentType;
  IntrospectorNavItem: ComponentType<IntrospectorNavItemProps>;
  WorkloadPage: ComponentType;
};

const getDefaultPlugin = (): IntrospectorPlugin => ({
  isEnabled: false,
  IntrospectorPage: PluginPlaceholder,
  IntrospectorNavItem: PluginPlaceholder,
  WorkloadPage: PluginPlaceholder,
});

export const PLUGIN_INTROSPECTOR = getDefaultPlugin();

/**
 * @internal Do not call directly. Use the main reinitialize function from metabase/plugins instead.
 */
export function reinitialize() {
  Object.assign(PLUGIN_INTROSPECTOR, getDefaultPlugin());
}
