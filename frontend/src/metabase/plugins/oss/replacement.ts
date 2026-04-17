import type { ComponentType, ReactElement, ReactNode } from "react";

import type { SourceReplacementEntry } from "metabase-types/api";
import type { State } from "metabase-types/store";

import { PluginPlaceholder } from "../components/PluginPlaceholder";

export type SourceReplacementModalProps = {
  initialSource?: SourceReplacementEntry;
  initialTarget?: SourceReplacementEntry;
  opened: boolean;
  onClose: () => void;
};

export type SourceReplacementButtonChildProps = {
  tooltip: string | undefined;
  isDisabled: boolean;
};

export type SourceReplacementButtonProps = {
  children: (props: SourceReplacementButtonChildProps) => ReactNode;
};

type ReplacementPlugin = {
  isEnabled: boolean;
  canReplaceSources: (state: State) => boolean;
  getTransformToolsRoutes: () => ReactElement | null;
  SourceReplacementButton: ComponentType<SourceReplacementButtonProps>;
  SourceReplacementModal: ComponentType<SourceReplacementModalProps>;
  SourceReplacementStatus: ComponentType;
  TransformToolsMenu: ComponentType;
};

const getDefaultReplacementPlugin = (): ReplacementPlugin => ({
  isEnabled: false,
  canReplaceSources: () => false,
  getTransformToolsRoutes: () => null,
  SourceReplacementButton: PluginPlaceholder,
  SourceReplacementModal: PluginPlaceholder,
  SourceReplacementStatus: PluginPlaceholder,
  TransformToolsMenu: PluginPlaceholder,
});

export const PLUGIN_REPLACEMENT = getDefaultReplacementPlugin();

export function reinitialize() {
  Object.assign(PLUGIN_REPLACEMENT, getDefaultReplacementPlugin());
}
