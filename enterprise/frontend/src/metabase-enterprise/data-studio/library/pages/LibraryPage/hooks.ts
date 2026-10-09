import type { Row } from "@tanstack/react-table";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { t } from "ttag";

import {
  collectionApi,
  skipToken,
  useListCollectionItemsQuery,
  useSearchQuery,
} from "metabase/api";
import { isLibraryCollection } from "metabase/common/collections/utils";
import { useDebouncedValue } from "metabase/common/hooks/use-debounced-value";
import type {
  LibrarySectionType,
  TreeItem,
} from "metabase/data-studio/common/types";
import {
  createEmptyStateItem,
  isEmptyStateData,
} from "metabase/data-studio/common/utils";
import { useGetIcon } from "metabase/hooks/use-icon";
import { useDispatch, useSelector } from "metabase/redux";
import { getIsRemoteSyncReadOnly } from "metabase-enterprise/remote_sync/selectors";
import type {
  Collection,
  CollectionId,
  CollectionItem,
  CollectionItemModel,
  IconName,
  SearchResult,
} from "metabase-types/api";

import { getAccessibleCollection } from "./utils";

export const useLibraryCollections = (collections: Collection[]) => {
  const libraryCollection = useMemo(
    () => collections.find(isLibraryCollection),
    [collections],
  );

  const tableCollection = useMemo(
    () =>
      libraryCollection &&
      getAccessibleCollection(libraryCollection, "library-data"),
    [libraryCollection],
  );

  const metricCollection = useMemo(
    () =>
      libraryCollection &&
      getAccessibleCollection(libraryCollection, "library-metrics"),
    [libraryCollection],
  );

  const dashboardCollection = useMemo(
    () =>
      libraryCollection &&
      getAccessibleCollection(libraryCollection, "library-dashboards"),
    [libraryCollection],
  );

  return {
    libraryCollection,
    tableCollection,
    metricCollection,
    dashboardCollection,
  };
};

const SECTION_ITEM_MODELS: Record<LibrarySectionType, CollectionItemModel[]> = {
  data: ["table", "collection"],
  metrics: ["metric", "collection"],
  dashboards: ["dashboard", "collection"],
  snippets: ["snippet", "collection"],
  actions: ["action", "collection"],
};

export function useLibraryCollectionTree(
  collection: Collection | undefined,
  sectionType: LibrarySectionType,
  metricCollectionId?: CollectionId,
) {
  const dispatch = useDispatch();
  const getIcon = useGetIcon();
  const models = SECTION_ITEM_MODELS[sectionType];

  // 1. Fetch top-level items
  const {
    data: topLevelItems,
    isLoading,
    error,
  } = useListCollectionItemsQuery(
    collection
      ? {
          id: collection.id,
          models,
          archived: false,
        }
      : skipToken,
  );

  const isRemoteSyncReadOnly = useSelector(getIsRemoteSyncReadOnly);

  // 2. Lazy-loaded subcollection items
  const [loadedCollections, setLoadedCollections] = useState<
    Map<CollectionId, CollectionItem[]>
  >(new Map());
  const loadingIds = useRef(new Set<string>());

  useEffect(() => {
    setLoadedCollections(new Map());
    loadingIds.current = new Set();
  }, [collection]);

  const loadCollectionItems = useCallback(
    async (collectionId: CollectionId) => {
      const key = String(collectionId);
      if (loadingIds.current.has(key)) {
        return;
      }
      loadingIds.current.add(key);

      const result = await dispatch(
        collectionApi.endpoints.listCollectionItems.initiate(
          {
            id: collectionId,
            models,
            archived: false,
          },
          { forceRefetch: true },
        ),
      );
      const items = (result.data?.data ?? []).filter((item) => !item.archived);
      setLoadedCollections((prev) => new Map([...prev, [collectionId, items]]));
    },
    [dispatch, models],
  );

  const refreshCollections = useCallback(
    async (collectionIds: CollectionId[]) => {
      for (const id of collectionIds) {
        const key = String(id);
        loadingIds.current.delete(key);
      }
      await Promise.all(collectionIds.map(loadCollectionItems));
    },
    [loadCollectionItems],
  );

  // 3. Build tree
  const tree = useMemo((): TreeItem[] => {
    if (isLoading || !topLevelItems || !collection) {
      return [];
    }

    const children = buildChildren(
      topLevelItems.data,
      loadedCollections,
      getIcon,
    );
    const hasItems = children.length > 0;

    return [
      {
        name: collection.name,
        id: `collection:${collection.id}`,
        icon: getIcon({ ...collection, model: "collection" }).name,
        data: { ...collection, model: "collection" as const },
        model: "collection",
        children: hasItems
          ? children
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
    isLoading,
    topLevelItems,
    collection,
    loadedCollections,
    getIcon,
    sectionType,
    metricCollectionId,
    isRemoteSyncReadOnly,
  ]);

  // 4. Watch rows for expanded-but-empty collections → trigger fetch
  const watchRows = useCallback(
    (rows: Row<TreeItem>[]) => {
      for (const row of rows) {
        const { original } = row;
        if (
          row.getIsExpanded() &&
          row.getCanExpand() &&
          original.model === "collection" &&
          original.children?.length === 0 &&
          !isEmptyStateData(original.data) &&
          "id" in original.data
        ) {
          // Unjustified type cast. FIXME
          loadCollectionItems(original.data.id as number);
        }
      }
    },
    [loadCollectionItems],
  );

  // 5. isChildrenLoading for the spinner
  const isChildrenLoading = useCallback(
    (row: Row<TreeItem>): boolean =>
      row.getIsExpanded() &&
      row.getCanExpand() &&
      row.original.children?.length === 0,
    [],
  );

  return {
    tree,
    isLoading,
    error,
    watchRows,
    isChildrenLoading,
    refreshCollections,
  };
}

/** Build children for a collection from its fetched items. Subcollections
 *  that haven't been loaded yet get `children: []` (if they have content
 *  according to `here`/`below`) so they render as expandable rows that
 *  trigger a lazy load, or `undefined` if they're empty. */
function buildChildren(
  items: CollectionItem[],
  loadedCollections: Map<CollectionId, CollectionItem[]>,
  getIcon: ReturnType<typeof useGetIcon>,
): TreeItem[] {
  const visibleItems = items.filter((i) => !i.archived);
  const collections = visibleItems.filter((i) => i.model === "collection");
  const leafItems = visibleItems.filter((i) => i.model !== "collection");

  return [
    ...collections.map((col): TreeItem => {
      const childItems = loadedCollections.get(col.id);
      let children: TreeItem[] | undefined;

      if (childItems !== undefined) {
        const built = buildChildren(childItems, loadedCollections, getIcon);
        children = built.length > 0 ? built : undefined;
      } else if (hasContent(col)) {
        children = [];
      }

      return {
        name: col.name,
        id: `collection:${col.id}`,
        icon: "folder",
        data: col,
        model: "collection",
        children,
        childrenLoaded: childItems !== undefined,
      };
    }),
    ...leafItems.map((leafItem) => buildItemNode(leafItem, getIcon)),
  ];
}

function buildItemNode(
  item: CollectionItem,
  getIcon: ReturnType<typeof useGetIcon>,
): TreeItem {
  return {
    name: item.name,
    updatedAt: item["last-edit-info"]?.timestamp,
    icon: getIcon({ model: item.model }).name,
    data: item,
    id: `${item.model}:${item.id}`,
    model: item.model,
  };
}

function hasContent(item: CollectionItem): boolean {
  return (
    (item.here != null && item.here.length > 0) ||
    (item.below != null && item.below.length > 0)
  );
}

const SEARCH_DEBOUNCE_MS = 300;

export type LibrarySearchModel = "table" | "metric" | "dashboard";

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

export function useLibrarySearch(
  searchQuery: string,
  libraryCollectionId: CollectionId | undefined,
  models: LibrarySearchModel[],
) {
  const debouncedQuery = useDebouncedValue(searchQuery, SEARCH_DEBOUNCE_MS);
  const isActive = debouncedQuery.trim().length > 0;
  const getIcon = useGetIcon();

  const {
    data: searchResponse,
    isLoading,
    isFetching,
    error,
  } = useSearchQuery(
    isActive && libraryCollectionId != null
      ? {
          q: debouncedQuery,
          collection: libraryCollectionId,
          models,
          context: "library",
        }
      : skipToken,
  );

  const tree = useMemo((): TreeItem[] => {
    if (!isActive || !searchResponse) {
      return [];
    }

    const sections = getSearchSections();
    return models.flatMap((model): TreeItem[] => {
      const children = searchResponse.data
        .filter((result) => result.model === model)
        .map((result) => createSearchResultItem(result, model, getIcon));
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
  }, [isActive, searchResponse, models, getIcon]);

  return {
    tree,
    isActive,
    isLoading: isLoading || isFetching,
    error,
  };
}

function createSearchResultItem(
  result: SearchResult,
  model: LibrarySearchModel,
  getIcon: ReturnType<typeof useGetIcon>,
): TreeItem {
  return {
    id: `${model}:${result.id}`,
    name: result.name,
    icon: getIcon({ model }).name,
    updatedAt: result.last_edited_at ?? result.updated_at,
    model,
    parentCollectionName: result.collection?.name,
    data: {
      id: Number(result.id),
      model,
      name: result.name,
      description: result.description,
      collection_id: result.collection_id ?? null,
      archived: result.archived ?? false,
      collection_position: result.collection_position,
      "last-edit-info": result["last-edit-info"],
    },
  };
}
