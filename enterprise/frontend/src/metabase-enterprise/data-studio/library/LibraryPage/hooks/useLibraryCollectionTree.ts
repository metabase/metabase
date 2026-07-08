import type { Row } from "@tanstack/react-table";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  collectionApi,
  skipToken,
  useListCollectionItemsQuery,
} from "metabase/api";
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
} from "metabase-types/api";

export function useLibraryCollectionTree(
  collection: Collection | undefined,
  sectionType: LibrarySectionType,
  metricCollectionId?: CollectionId,
) {
  const dispatch = useDispatch();
  const getIcon = useGetIcon();

  // 1. Fetch top-level items
  const {
    data: topLevelItems,
    isLoading,
    error,
  } = useListCollectionItemsQuery(
    collection
      ? {
          id: collection.id,
          models: ["metric", "table", "collection"],
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
            models: ["metric", "table", "collection"],
            archived: false,
          },
          { forceRefetch: true },
        ),
      );
      const items = (result.data?.data ?? []).filter((item) => !item.archived);
      setLoadedCollections((prev) => new Map([...prev, [collectionId, items]]));
    },
    [dispatch],
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
