import type { ComponentType } from "react";

import { NotFoundPlaceholder } from "../components/PluginPlaceholder";

export const PLUGIN_SUPPORT: {
  isEnabled: boolean;
  SupportSettings: ComponentType;
  GrantAccessModal: ComponentType<{ onClose: VoidFunction }>;
} = {
  isEnabled: false,
  SupportSettings: NotFoundPlaceholder,
  GrantAccessModal: NotFoundPlaceholder,
};
