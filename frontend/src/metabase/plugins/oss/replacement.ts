import type { ComponentType } from "react";

import type { SourceReplacementEntry } from "metabase-types/api";
import type { State } from "metabase-types/store";

import { PluginPlaceholder } from "../components/PluginPlaceholder";

export type ReplaceDataSourceModalProps = {
  initialSource?: SourceReplacementEntry;
  initialTarget?: SourceReplacementEntry;
  isOpened: boolean;
  onClose: () => void;
};

type ReplacementPlugin = {
  isEnabled: boolean;
  canUserReplaceSources: (state: State) => boolean;
  ReplaceDataSourceModal: ComponentType<ReplaceDataSourceModalProps>;
  SourceReplacementStatus: ComponentType;
};

const getDefaultReplacementPlugin = (): ReplacementPlugin => ({
  isEnabled: false,
  canUserReplaceSources: () => false,
  ReplaceDataSourceModal: PluginPlaceholder,
  SourceReplacementStatus: PluginPlaceholder,
});

export const PLUGIN_REPLACEMENT = getDefaultReplacementPlugin();

export function reinitialize() {
  Object.assign(PLUGIN_REPLACEMENT, getDefaultReplacementPlugin());
}
