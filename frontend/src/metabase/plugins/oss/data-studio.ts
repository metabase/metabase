import type { Store } from "@reduxjs/toolkit";
import type { ComponentType, ReactNode } from "react";

import type Question from "metabase-lib/v1/Question";
import type {
  Collection,
  CollectionItem,
  CollectionItemModel,
  CollectionType,
  LibraryCollection,
} from "metabase-types/api";
import type { State } from "metabase-types/store";

import { PluginPlaceholder } from "../components/PluginPlaceholder";

export type NavbarLibrarySectionProps = {
  collections: Collection[];
  selectedId?: string | number;
  onItemSelect: () => void;
};

export type LibraryCollectionType = "root" | "data" | "metrics";

export type DataStudioToolbarButtonProps = {
  question: Pick<Question, "type" | "id">;
};

type DataStudioPlugin = {
  isEnabled: boolean;
  canAccessDataStudio: (state: State) => boolean;
  getDataStudioRoutes: (
    store: Store<State>,
    CanAccessDataStudio: ComponentType,
    CanAccessDataModel: ComponentType,
    CanAccessTransforms: ComponentType,
  ) => ReactNode;
  DataStudioToolbarButton: ComponentType<DataStudioToolbarButtonProps>;
  NavbarLibrarySection: ComponentType<NavbarLibrarySectionProps>;
  getLibraryCollectionType: (
    collectionType: CollectionType | null | undefined,
  ) => LibraryCollectionType | undefined;
  canPlaceEntityInCollection: (
    entityType: CollectionItemModel,
    collectionType: CollectionType | null | undefined,
  ) => boolean;
  canPlaceEntityInCollectionOrDescendants: (
    entityType: CollectionItemModel,
    collectionType: CollectionType | null | undefined,
  ) => boolean;
  useGetLibraryChildCollectionByType: ({
    skip,
    type,
  }: {
    skip?: boolean;
    type: CollectionType;
  }) => CollectionItem | undefined;
  useGetLibraryCollection: (props?: { skip?: boolean }) => {
    data: undefined | LibraryCollection;
    isLoading: boolean;
  };
  useGetResolvedLibraryCollection: (props?: { skip?: boolean }) => {
    data: undefined | LibraryCollection | CollectionItem;
    isLoading: boolean;
  };
};

const getDefaultPluginDataStudio = (): DataStudioPlugin => ({
  isEnabled: false,
  canAccessDataStudio: () => false,
  getDataStudioRoutes: () => null,
  DataStudioToolbarButton: PluginPlaceholder,
  NavbarLibrarySection: PluginPlaceholder,
  getLibraryCollectionType: () => undefined,
  canPlaceEntityInCollection: () => true,
  canPlaceEntityInCollectionOrDescendants: () => true,
  useGetLibraryChildCollectionByType: ({ skip: _skip, type: _type }) =>
    undefined,
  useGetLibraryCollection: (_props) => ({ data: undefined, isLoading: false }),
  useGetResolvedLibraryCollection: (_props) => ({
    data: undefined,
    isLoading: false,
  }),
});

export const PLUGIN_DATA_STUDIO = getDefaultPluginDataStudio();

/**
 * @internal Do not call directly. Use the main reinitialize function from metabase/plugins instead.
 */
export function reinitialize() {
  Object.assign(PLUGIN_DATA_STUDIO, getDefaultPluginDataStudio());
}
