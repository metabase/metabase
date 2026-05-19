import type { BaseQueryFn, QueryDefinition } from "@reduxjs/toolkit/query";
import type { ComponentType, ReactNode } from "react";

import type { TagType } from "metabase/api/tags";
import type {
  OmniPickerCollectionItem,
  OmniPickerItem,
} from "metabase/common/components/Pickers/EntityPicker/types";
import type { MiniPickerCollectionFolderItem } from "metabase/common/components/Pickers/MiniPicker/types";
import type { UseQuery } from "metabase/entities/containers/rtk-query/types/rtk";
import { PluginPlaceholder } from "metabase/plugins/components/PluginPlaceholder";
import type {
  Collection,
  CollectionId,
  CollectionItem,
  CollectionNamespace,
  CollectionType,
  DatabaseId,
  GetLibraryCollectionResponse,
  LibraryCollection,
  SchemaId,
  TableId,
} from "metabase-types/api";

export type CreateLibraryModalProps = {
  title?: string;
  explanatorySentence?: string;
  isOpened: boolean;
  onCreate?: (collection: Collection) => void;
  onClose: () => void;
};

export type PublishTablesModalProps = {
  databaseIds?: DatabaseId[];
  schemaIds?: SchemaId[];
  tableIds?: TableId[];
  isOpened: boolean;
  onPublish: () => void;
  onClose: () => void;
};
export type UnpublishTablesModalProps = {
  databaseIds?: DatabaseId[];
  schemaIds?: SchemaId[];
  tableIds?: TableId[];
  isOpened: boolean;
  onUnpublish: () => void;
  onClose: () => void;
};

export type CollectionPermissionsModalProps = {
  collectionId: CollectionId;
  namespace?: CollectionNamespace | null;
  onClose: () => void;
};

export type LibraryCollectionType =
  | "library"
  | "library-data"
  | "library-metrics";

export type LibrarySubCollectionType = "library-data" | "library-metrics";

export type GetEntityPickerSyntheticLibraryItemFunction = {
  (params: {
    collectionId: CollectionId;
    type: LibrarySubCollectionType;
    miniPicker: true;
  }): MiniPickerCollectionFolderItem | undefined;

  (params: {
    collectionId: CollectionId;
    type: LibrarySubCollectionType;
    miniPicker?: false | undefined;
  }): OmniPickerCollectionItem | undefined;
};

type LibraryPlugin = {
  isEnabled: boolean;
  getDataStudioLibraryRoutes: (IsAdmin: ComponentType) => ReactNode;
  useGetLibraryCollection: (params?: { skip?: boolean }) => {
    data: undefined | LibraryCollection;
    isLoading: boolean;
  };
  useGetLibraryChildCollectionByType: ({
    skip,
    type,
  }: {
    skip?: boolean;
    type: CollectionType;
  }) => CollectionItem | undefined;
  useGetResolvedLibraryCollection: (params?: { skip?: boolean }) => {
    data: undefined | LibraryCollection | CollectionItem;
    isLoading: boolean;
  };
  getCollectionPickerItems: ({
    parentItem,
    items,
  }: {
    parentItem: OmniPickerItem;
    items: CollectionItem[];
  }) => OmniPickerItem[] | undefined;
  getEntityPickerSyntheticLibraryItem: GetEntityPickerSyntheticLibraryItemFunction;
  CreateLibraryModal: ComponentType<CreateLibraryModalProps>;
  CollectionPermissionsModal: ComponentType<CollectionPermissionsModalProps>;
  PublishTablesModal: ComponentType<PublishTablesModalProps>;
  UnpublishTablesModal: ComponentType<UnpublishTablesModalProps>;
  useGetLibraryCollectionQuery: UseQuery<
    QueryDefinition<void, BaseQueryFn, TagType, GetLibraryCollectionResponse>
  >;
  getLibraryCollectionEmptyStateMessages: (type: LibrarySubCollectionType) => {
    title: string;
    description: string;
  };
  isLibraryCollectionType: (
    type?: string | null,
  ) => type is LibraryCollectionType;
  isLibrarySubCollectionType: (
    type?: string | null,
  ) => type is LibrarySubCollectionType;
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
  getCollectionPickerItems: () => undefined,
  getEntityPickerSyntheticLibraryItem: () => undefined,
  CreateLibraryModal:
    PluginPlaceholder as ComponentType<CreateLibraryModalProps>,
  CollectionPermissionsModal:
    PluginPlaceholder as ComponentType<CollectionPermissionsModalProps>,
  PublishTablesModal:
    PluginPlaceholder as ComponentType<PublishTablesModalProps>,
  UnpublishTablesModal:
    PluginPlaceholder as ComponentType<UnpublishTablesModalProps>,
  useGetLibraryCollectionQuery:
    (() => []) as unknown as LibraryPlugin["useGetLibraryCollectionQuery"],
  getLibraryCollectionEmptyStateMessages: () => ({
    title: "",
    description: "",
  }),
  isLibraryCollectionType: (
    _type?: string | null,
  ): _type is LibraryCollectionType => false,
  isLibrarySubCollectionType: (
    _type?: string | null,
  ): _type is LibrarySubCollectionType => false,
});

export const PLUGIN_LIBRARY = getDefaultPluginLibrary();

/**
 * @internal Do not call directly. Use the main reinitialize function from metabase/plugins instead.
 */
export function reinitialize() {
  Object.assign(PLUGIN_LIBRARY, getDefaultPluginLibrary());
}
