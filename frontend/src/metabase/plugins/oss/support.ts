import type { ComponentType } from "react";

import { NotFoundPlaceholder } from "../components/PluginPlaceholder";

const getDefaultPluginSupport = () => ({
  isEnabled: false,
  SupportSettings: NotFoundPlaceholder,
  GrantAccessModal: NotFoundPlaceholder,
});

export const PLUGIN_SUPPORT: {
  isEnabled: boolean;
  SupportSettings: ComponentType;
  GrantAccessModal: ComponentType<{ onClose: VoidFunction }>;
} = getDefaultPluginSupport();

export function reinitialize() {
  Object.assign(PLUGIN_SUPPORT, getDefaultPluginSupport());
}
