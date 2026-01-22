import type { ReactNode } from "react";

import type { CollectionItem, CollectionType } from "metabase-types/api";

type LibraryPlugin = {
  isEnabled: boolean;
  getDataStudioLibraryRoutes: () => ReactNode;
  useGetLibraryCollection: (params?: { skip?: boolean }) => {
    isLoading: boolean;
    data: CollectionItem | undefined;
  };
  useGetLibraryChildCollectionByType: (params: {
    skip?: boolean;
    type: CollectionType;
  }) => CollectionItem | undefined;
  useGetResolvedLibraryCollection: (params?: { skip?: boolean }) => {
    isLoading: boolean;
    data: CollectionItem | undefined;
  };
};

const getDefaultPluginLibrary = (): LibraryPlugin => ({
  isEnabled: false,
  getDataStudioLibraryRoutes: () => null,
  useGetLibraryCollection: () => ({ isLoading: false, data: undefined }),
  useGetLibraryChildCollectionByType: () => undefined,
  useGetResolvedLibraryCollection: () => ({
    isLoading: false,
    data: undefined,
  }),
});

export const PLUGIN_LIBRARY = getDefaultPluginLibrary();

/**
 * @internal Do not call directly. Use the main reinitialize function from metabase/plugins instead.
 */
export function reinitialize() {
  Object.assign(PLUGIN_LIBRARY, getDefaultPluginLibrary());
}
