import type { Row } from "@tanstack/react-table";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { shallowEqual } from "react-redux";

import {
  collectionApi,
  skipToken,
  useListCollectionItemsQuery,
} from "metabase/api";
import type { TreeItem } from "metabase/data-studio/common/types";
import { useGetIcon } from "metabase/hooks/use-icon";
import { useDispatch, useSelector } from "metabase/redux";
import type { State } from "metabase/redux/store";
import type {
  Collection,
  CollectionId,
  CollectionItem,
  CollectionItemModel,
} from "metabase-types/api";

const NO_ITEMS: CollectionItem[] = [];

const getCollectionItemsRequest = (
  collectionId: CollectionId,
  models: CollectionItemModel[],
) => ({
  id: collectionId,
  models,
  archived: false,
});

type CollectionItemsTree = {
  /** The collection's folders and items, or nothing until they have loaded */
  items: TreeItem[] | undefined;
  isLoading: boolean;
  error: unknown;
  watchRows: (rows: Row<TreeItem>[]) => void;
  isChildrenLoading: (row: Row<TreeItem>) => boolean;
};

/**
 * The folders and `models` items of a collection, with folders loading their
 * own items once their rows expand. `watchRows` subscribes the expanded folders
 * of this tree to the API cache, so a later invalidation refreshes them.
 */
export function useCollectionItemsTree(
  collection: Collection | undefined,
  models: CollectionItemModel[],
): CollectionItemsTree {
  const dispatch = useDispatch();
  const getIcon = useGetIcon();

  const {
    data: topLevelItems,
    isLoading,
    error,
  } = useListCollectionItemsQuery(
    collection ? getCollectionItemsRequest(collection.id, models) : skipToken,
  );

  const [expandedCollectionIds, setExpandedCollectionIds] = useState<
    CollectionId[]
  >([]);
  const subscriptionsRef = useRef(
    new Map<CollectionId, { unsubscribe: () => void }>(),
  );

  const collectionId = collection?.id;
  useEffect(() => {
    setExpandedCollectionIds((ids) => (ids.length > 0 ? [] : ids));
  }, [collectionId, models]);

  useEffect(() => {
    const subscriptions = subscriptionsRef.current;
    expandedCollectionIds.forEach((expandedId) => {
      if (!subscriptions.has(expandedId)) {
        subscriptions.set(
          expandedId,
          dispatch(
            collectionApi.endpoints.listCollectionItems.initiate(
              getCollectionItemsRequest(expandedId, models),
            ),
          ),
        );
      }
    });
    subscriptions.forEach((subscription, expandedId) => {
      if (!expandedCollectionIds.includes(expandedId)) {
        subscription.unsubscribe();
        subscriptions.delete(expandedId);
      }
    });
  }, [dispatch, expandedCollectionIds, models]);

  useEffect(() => {
    const subscriptions = subscriptionsRef.current;
    return () => {
      subscriptions.forEach((subscription) => subscription.unsubscribe());
      subscriptions.clear();
    };
  }, []);

  const expandedCollectionSelectors = useMemo(
    () =>
      expandedCollectionIds.map((expandedId) =>
        collectionApi.endpoints.listCollectionItems.select(
          getCollectionItemsRequest(expandedId, models),
        ),
      ),
    [expandedCollectionIds, models],
  );

  const expandedCollectionItems = useSelector(
    (state: State) =>
      expandedCollectionSelectors.map((selectCollectionItems) => {
        const { data, isError } = selectCollectionItems(state);
        return data?.data ?? (isError ? NO_ITEMS : undefined);
      }),
    shallowEqual,
  );

  const loadedCollections = useMemo(
    () =>
      new Map(
        expandedCollectionIds.flatMap((expandedId, index) => {
          const items = expandedCollectionItems[index];
          return items ? [[expandedId, items] as const] : [];
        }),
      ),
    [expandedCollectionIds, expandedCollectionItems],
  );

  const items = useMemo(
    (): TreeItem[] | undefined =>
      isLoading || !topLevelItems || !collection
        ? undefined
        : buildChildren(topLevelItems.data, loadedCollections, getIcon),
    [isLoading, topLevelItems, collection, loadedCollections, getIcon],
  );

  const folderIds = useMemo(() => getFolderIds(items ?? []), [items]);
  const watchRows = useCallback(
    (rows: Row<TreeItem>[]) => {
      const collectionIdsToLoad = rows.flatMap((row) => {
        const { original } = row;
        const isExpandedWithoutChildren =
          row.getIsExpanded() &&
          row.getCanExpand() &&
          original.model === "collection" &&
          original.children?.length === 0;
        return isExpandedWithoutChildren &&
          original.data.model === "collection" &&
          original.data.id !== undefined &&
          folderIds.has(original.data.id)
          ? [original.data.id]
          : [];
      });
      if (collectionIdsToLoad.length === 0) {
        return;
      }
      setExpandedCollectionIds((previousIds) => {
        const newIds = collectionIdsToLoad.filter(
          (idToLoad) => !previousIds.includes(idToLoad),
        );
        return newIds.length > 0 ? [...previousIds, ...newIds] : previousIds;
      });
    },
    [folderIds],
  );

  const isChildrenLoading = useCallback(
    (row: Row<TreeItem>): boolean =>
      row.getIsExpanded() &&
      row.getCanExpand() &&
      row.original.children?.length === 0,
    [],
  );

  return {
    items,
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

function getFolderIds(items: TreeItem[]): Set<CollectionId> {
  return new Set(
    items.flatMap((item): CollectionId[] => {
      const { data } = item;
      if (
        item.model !== "collection" ||
        data.model !== "collection" ||
        data.id === undefined
      ) {
        return [];
      }
      return [data.id, ...getFolderIds(item.children ?? [])];
    }),
  );
}
