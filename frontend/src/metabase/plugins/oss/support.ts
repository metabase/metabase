import type { ComponentType } from "react";

import type { ModalComponentProps } from "metabase/common/components/ModalRoute";

import { PluginPlaceholder } from "../components/PluginPlaceholder";
import { definePluginSlot } from "../slot";

const getDefaultPluginSupport = () => ({
  isEnabled: false,
  SupportSettings: PluginPlaceholder,
  GrantAccessModal: PluginPlaceholder,
});

export const PLUGIN_SUPPORT: {
  isEnabled: boolean;
  SupportSettings: ComponentType;
  GrantAccessModal: ComponentType<ModalComponentProps>;
} = definePluginSlot(getDefaultPluginSupport);
