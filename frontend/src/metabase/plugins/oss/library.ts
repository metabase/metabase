import type { BaseQueryFn, QueryDefinition } from "@reduxjs/toolkit/query";
import type { ComponentType, ReactNode } from "react";

import type { TagType } from "metabase/api/tags";
import type { UseQuery } from "metabase/entities/containers/rtk-query/types/rtk";
import { PluginPlaceholder } from "metabase/plugins/components/PluginPlaceholder";
import type {
  Collection,
  CollectionItem,
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

type LibraryPlugin = {
  isEnabled: boolean;
  getDataStudioLibraryRoutes: () => ReactNode;
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
  CreateLibraryModal: ComponentType<CreateLibraryModalProps>;
  PublishTablesModal: ComponentType<PublishTablesModalProps>;
  UnpublishTablesModal: ComponentType<UnpublishTablesModalProps>;
  useGetLibraryCollectionQuery: UseQuery<
    QueryDefinition<void, BaseQueryFn, TagType, GetLibraryCollectionResponse>
  >;
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
  CreateLibraryModal:
    PluginPlaceholder as ComponentType<CreateLibraryModalProps>,
  PublishTablesModal:
    PluginPlaceholder as ComponentType<PublishTablesModalProps>,
  UnpublishTablesModal:
    PluginPlaceholder as ComponentType<UnpublishTablesModalProps>,
  useGetLibraryCollectionQuery:
    (() => []) as unknown as LibraryPlugin["useGetLibraryCollectionQuery"],
});

export const PLUGIN_LIBRARY = getDefaultPluginLibrary();

/**
 * @internal Do not call directly. Use the main reinitialize function from metabase/plugins instead.
 */
export function reinitialize() {
  Object.assign(PLUGIN_LIBRARY, getDefaultPluginLibrary());
}
