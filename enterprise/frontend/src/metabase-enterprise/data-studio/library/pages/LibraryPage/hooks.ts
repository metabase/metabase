import { useMemo } from "react";
import { t } from "ttag";

import type {
  LibrarySectionType,
  TreeItem,
} from "metabase/data-studio/common/types";
import { useGetIcon } from "metabase/hooks/use-icon";
import type {
  Collection,
  CollectionId,
  CollectionItemModel,
  IconName,
} from "metabase-types/api";

import { useCollectionItemsTree } from "../../hooks/use-collection-items-tree";
import {
  type LibrarySearchModel,
  useLibrarySearchResults,
} from "../../hooks/use-library-search-results";

const SECTION_ITEM_MODELS: Record<LibrarySectionType, CollectionItemModel[]> = {
  data: ["table", "collection"],
  metrics: ["metric", "collection"],
  snippets: ["snippet", "collection"],
  actions: ["action", "collection"],
};

/**
 * A Library section: the section's collection as a root row holding its
 * folders and items, or no rows when it has none so the page shows its
 * empty state.
 */
export function useLibraryCollectionTree(
  collection: Collection | undefined,
  sectionType: LibrarySectionType,
) {
  const getIcon = useGetIcon();
  const { items, isLoading, error, watchRows, isChildrenLoading } =
    useCollectionItemsTree(collection, SECTION_ITEM_MODELS[sectionType]);

  const tree = useMemo((): TreeItem[] => {
    if (!collection || !items || items.length === 0) {
      return [];
    }

    return [
      {
        name: collection.name,
        id: `collection:${collection.id}`,
        icon: getIcon({ ...collection, model: "collection" }).name,
        data: { ...collection, model: "collection" as const },
        model: "collection",
        children: items,
      },
    ];
  }, [collection, items, getIcon]);

  return {
    tree,
    isLoading,
    error,
    watchRows,
    isChildrenLoading,
  };
}

type SearchSection = {
  id: string;
  name: string;
  icon: IconName;
};

const getSearchSections = (): Record<LibrarySearchModel, SearchSection> => ({
  table: { id: "search-section:data", name: t`Data`, icon: "table" },
  metric: { id: "search-section:metrics", name: t`Metrics`, icon: "metric" },
  dashboard: {
    id: "search-section:dashboards",
    name: t`Dashboards`,
    icon: "dashboard",
  },
});

/** Search results across the Library, grouped under a row per section */
export function useLibrarySearch(
  searchQuery: string,
  libraryCollectionId: CollectionId | undefined,
  models: LibrarySearchModel[],
) {
  const { items, isActive, isLoading, error } = useLibrarySearchResults(
    searchQuery,
    libraryCollectionId,
    models,
  );

  const tree = useMemo((): TreeItem[] => {
    const sections = getSearchSections();
    return models.flatMap((model): TreeItem[] => {
      const children = items.filter((item) => item.model === model);
      if (children.length === 0) {
        return [];
      }
      const { id, name, icon } = sections[model];
      return [
        {
          id,
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
