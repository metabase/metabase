import type { Row } from "@tanstack/react-table";
import { useCallback, useEffect, useMemo, useState } from "react";
import { shallowEqual } from "react-redux";
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
import { createEmptyStateItem } from "metabase/data-studio/common/utils";
import { useGetIcon } from "metabase/hooks/use-icon";
import { useDispatch, useSelector } from "metabase/redux";
import type { State } from "metabase/redux/store";
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

  const [expandedCollectionIds, setExpandedCollectionIds] = useState<
    CollectionId[]
  >([]);

  useEffect(() => {
    setExpandedCollectionIds([]);
  }, [collection]);

  const getItemsRequest = useCallback(
    (collectionId: CollectionId) => ({
      id: collectionId,
      models,
      archived: false,
    }),
    [models],
  );

  useEffect(() => {
    const subscriptions = expandedCollectionIds.map((collectionId) =>
      dispatch(
        collectionApi.endpoints.listCollectionItems.initiate(
          getItemsRequest(collectionId),
        ),
      ),
    );
    return () => {
      subscriptions.forEach((subscription) => subscription.unsubscribe());
    };
  }, [dispatch, expandedCollectionIds, getItemsRequest]);

  const expandedCollectionItems = useSelector(
    (state: State) =>
      expandedCollectionIds.map(
        (collectionId) =>
          collectionApi.endpoints.listCollectionItems.select(
            getItemsRequest(collectionId),
          )(state).data,
      ),
    shallowEqual,
  );

  const loadedCollections = useMemo(
    () =>
      new Map(
        expandedCollectionIds.flatMap((collectionId, index) => {
          const response = expandedCollectionItems[index];
          return response
            ? [
                [
                  collectionId,
                  response.data.filter((item) => !item.archived),
                ] as const,
              ]
            : [];
        }),
      ),
    [expandedCollectionIds, expandedCollectionItems],
  );

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

  const watchRows = useCallback((rows: Row<TreeItem>[]) => {
    const collectionIdsToLoad = rows.flatMap((row) => {
      const { original } = row;
      const isExpandedWithoutChildren =
        row.getIsExpanded() &&
        row.getCanExpand() &&
        original.model === "collection" &&
        original.children?.length === 0;
      return isExpandedWithoutChildren &&
        original.data.model === "collection" &&
        original.data.id != null
        ? [original.data.id]
        : [];
    });
    if (collectionIdsToLoad.length === 0) {
      return;
    }
    setExpandedCollectionIds((previousIds) => {
      const newIds = collectionIdsToLoad.filter(
        (collectionId) => !previousIds.includes(collectionId),
      );
      return newIds.length > 0 ? [...previousIds, ...newIds] : previousIds;
    });
  }, []);

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
