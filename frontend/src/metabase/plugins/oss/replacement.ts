import type { ComponentType } from "react";

import type { ReplaceSourceEntry } from "metabase-types/api";

import { PluginPlaceholder } from "../components/PluginPlaceholder";

export type ReplaceDataSourceModalProps = {
  opened: boolean;
  source?: ReplaceSourceEntry;
  target?: ReplaceSourceEntry;
  onClose: () => void;
};

type ReplacementPlugin = {
  isEnabled: boolean;
  ReplaceDataSourceModal: ComponentType<ReplaceDataSourceModalProps>;
};

const getDefaultReplacementPlugin = (): ReplacementPlugin => ({
  isEnabled: false,
  ReplaceDataSourceModal: PluginPlaceholder,
});

export const PLUGIN_REPLACEMENT = getDefaultReplacementPlugin();

export function reinitialize() {
  Object.assign(PLUGIN_REPLACEMENT, getDefaultReplacementPlugin());
}
