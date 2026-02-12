import type { ReactNode } from "react";

type ReplacementPlugin = {
  isEnabled: boolean;
  getReplaceDataSourceRoutes: () => ReactNode;
};

const getDefaultReplacementPlugin = (): ReplacementPlugin => ({
  isEnabled: false,
  getReplaceDataSourceRoutes: () => null,
});

export const PLUGIN_REPLACEMENT = getDefaultReplacementPlugin();

export function reinitialize() {
  Object.assign(PLUGIN_REPLACEMENT, getDefaultReplacementPlugin());
}
