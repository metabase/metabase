import type { ComponentType } from "react";

import { PluginPlaceholder } from "metabase/plugins/components/PluginPlaceholder";

type IntrospectorPlugin = {
  isEnabled: boolean;
  IntrospectorPage: ComponentType;
  WorkloadPage: ComponentType;
};

const getDefaultPlugin = (): IntrospectorPlugin => ({
  isEnabled: false,
  IntrospectorPage: PluginPlaceholder,
  WorkloadPage: PluginPlaceholder,
});

export const PLUGIN_INTROSPECTOR = getDefaultPlugin();

/**
 * @internal Do not call directly. Use the main reinitialize function from metabase/plugins instead.
 */
export function reinitialize() {
  Object.assign(PLUGIN_INTROSPECTOR, getDefaultPlugin());
}
