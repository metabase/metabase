import type { ReactNode } from "react";

type LibraryPlugin = {
  isEnabled: boolean;
  getDataStudioLibraryRoutes: () => ReactNode;
};

const getDefaultPluginLibrary = (): LibraryPlugin => ({
  isEnabled: false,
  getDataStudioLibraryRoutes: () => null,
});

export const PLUGIN_LIBRARY = getDefaultPluginLibrary();

/**
 * @internal Do not call directly. Use the main reinitialize function from metabase/plugins instead.
 */
export function reinitialize() {
  Object.assign(PLUGIN_LIBRARY, getDefaultPluginLibrary());
}
