import { useMemo } from "react";

import { LIBRARY_SECTIONS } from "metabase/common/data-studio/library-sections";
import type {
  LibrarySectionType,
  TreeItem,
} from "metabase/data-studio/common/types";
import { createEmptyStateItem } from "metabase/data-studio/common/utils";
import { useGetIcon } from "metabase/hooks/use-icon";
import { useSelector } from "metabase/redux";
import { getIsRemoteSyncReadOnly } from "metabase-enterprise/remote_sync/selectors";
import type {
  Collection,
  CollectionId,
  CollectionItemModel,
  LibrarySubCollectionType,
} from "metabase-types/api";

import { useCollectionItemsTree } from "../../hooks/use-collection-items-tree";
import { useLibrarySearchResults } from "../../hooks/use-library-search-results";

const SECTION_ITEM_MODELS: Record<LibrarySectionType, CollectionItemModel[]> = {
  data: ["table", "collection"],
  metrics: ["metric", "collection"],
  snippets: ["snippet", "collection"],
  actions: ["action", "collection"],
};

/**
 * A Semantic layer section: the section's collection as a root row holding its
 * folders and items, or the section's empty-state row when it has none.
 */
export function useLibraryCollectionTree(
  collection: Collection | undefined,
  sectionType: LibrarySectionType,
  metricCollectionId?: CollectionId,
) {
  const getIcon = useGetIcon();
  const isRemoteSyncReadOnly = useSelector(getIsRemoteSyncReadOnly);
  const { items, isLoading, error, watchRows, isChildrenLoading } =
    useCollectionItemsTree(collection, SECTION_ITEM_MODELS[sectionType]);

  const tree = useMemo((): TreeItem[] => {
    if (!collection || !items) {
      return [];
    }

    return [
      {
        name: collection.name,
        id: `collection:${collection.id}`,
        icon: getIcon({ ...collection, model: "collection" }).name,
        data: { ...collection, model: "collection" as const },
        model: "collection",
        children:
          items.length > 0
            ? items
            : [
                createEmptyStateItem(
                  sectionType,
                  metricCollectionId,
                  isRemoteSyncReadOnly,
                ),
              ],
      },
    ];
  }, [
    collection,
    items,
    getIcon,
    sectionType,
    metricCollectionId,
    isRemoteSyncReadOnly,
  ]);

  return {
    tree,
    isLoading,
    error,
    watchRows,
    isChildrenLoading,
  };
}

/** The models the Semantic layer page searches */
export type LibraryRootSearchModel = "table" | "metric";

const SEARCH_SECTION_TYPES = {
  table: "library-data",
  metric: "library-metrics",
} as const satisfies Record<LibraryRootSearchModel, LibrarySubCollectionType>;

/** Search results across the Library, grouped under a row per section */
export function useLibrarySearch(
  searchQuery: string,
  libraryCollectionId: CollectionId | undefined,
  models: LibraryRootSearchModel[],
) {
  const { items, isActive, isLoading, error } = useLibrarySearchResults(
    searchQuery,
    libraryCollectionId,
    models,
  );

  const tree = useMemo((): TreeItem[] => {
    return models.flatMap((model): TreeItem[] => {
      const children = items.filter((item) => item.model === model);
      if (children.length === 0) {
        return [];
      }
      const { key, icon, getName } =
        LIBRARY_SECTIONS[SEARCH_SECTION_TYPES[model]];
      const name = getName();
      return [
        {
          id: `search-section:${key}`,
          name,
          icon,
          model: "collection",
          data: { model: "collection", name },
          children,
        },
      ];
    });
  }, [items, models]);

  return { tree, isActive, isLoading, error };
}
