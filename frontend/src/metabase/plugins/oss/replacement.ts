import type { ComponentType } from "react";

import type { ReplaceSourceEntry } from "metabase-types/api";
import type { State } from "metabase-types/store";

import { PluginPlaceholder } from "../components/PluginPlaceholder";

export type ReplaceDataSourceModalProps = {
  initialSource?: ReplaceSourceEntry;
  initialTarget?: ReplaceSourceEntry;
  isOpened: boolean;
  onClose: () => void;
};

type ReplacementPlugin = {
  isEnabled: boolean;
  canUserReplaceSource: (state: State) => boolean;
  ReplaceDataSourceModal: ComponentType<ReplaceDataSourceModalProps>;
};

const getDefaultReplacementPlugin = (): ReplacementPlugin => ({
  isEnabled: false,
  canUserReplaceSource: () => false,
  ReplaceDataSourceModal: PluginPlaceholder,
});

export const PLUGIN_REPLACEMENT = getDefaultReplacementPlugin();

export function reinitialize() {
  Object.assign(PLUGIN_REPLACEMENT, getDefaultReplacementPlugin());
}
