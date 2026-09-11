import type { ComponentType } from "react";

import type { ModalComponentProps } from "metabase/common/components/ModalRoute";
import { definePluginSlot } from "metabase/plugin-slots";

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
} = definePluginSlot(getDefaultPluginSupport);
