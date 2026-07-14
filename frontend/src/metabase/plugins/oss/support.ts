import type { ComponentType } from "react";

import type { ModalComponentProps } from "metabase/hoc/ModalRoute";

import { PluginPlaceholder } from "../components/PluginPlaceholder";

const getDefaultPluginSupport = () => ({
  isEnabled: false,
  SupportSettings: PluginPlaceholder,
  GrantAccessModal: PluginPlaceholder,
});

export const PLUGIN_SUPPORT: {
  isEnabled: boolean;
  SupportSettings: ComponentType;
  GrantAccessModal: ComponentType<ModalComponentProps>;
} = getDefaultPluginSupport();

/**
 * @internal Do not call directly. Use the main reinitialize function from metabase/plugins instead.
 */
export function reinitialize() {
  Object.assign(PLUGIN_SUPPORT, getDefaultPluginSupport());
}
