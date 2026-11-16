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
import { useSetting } from "metabase/settings";
import type {
  CollectionId,
  CollectionItem,
  ListCollectionItemsRequest,
} from "metabase-types/api";

const NO_ITEMS: CollectionItem[] = [];

export type SemanticLayerItemModel = "table" | "metric";

const getCollectionItemsRequest = (
  collectionId: CollectionId,
  itemModel: SemanticLayerItemModel,
): ListCollectionItemsRequest => ({
  id: collectionId,
  models: ["collection", itemModel],
  archived: false,
});

const getRootItemsRequest = (
  itemModel: SemanticLayerItemModel,
): ListCollectionItemsRequest => ({
  ...getCollectionItemsRequest("root", itemModel),
  "include-library": true,
});

const getSharedTenantRootItemsRequest = (
  itemModel: SemanticLayerItemModel,
): ListCollectionItemsRequest => ({
  ...getCollectionItemsRequest("root", itemModel),
  namespace: "shared-tenant-collection",
});

type CollectionItemsTree = {
  /** The top-level folders and items, or nothing until they have loaded */
  items: TreeItem[] | undefined;
  isLoading: boolean;
  error: unknown;
  watchRows: (rows: Row<TreeItem>[]) => void;
  isChildrenLoading: (row: Row<TreeItem>) => boolean;
};

/**
 * The `itemModel` items of the main and shared tenant collection namespaces as
 * one tree, keeping only the folders that hold such items at any depth. Folders
 * load their own items once their rows expand. `watchRows` subscribes the
 * expanded folders of this tree to the API cache, so a later invalidation
 * refreshes them. Row ids start with `idPrefix`, so two trees can show the same
 * folder.
 */
export function useCollectionItemsTree(
  itemModel: SemanticLayerItemModel,
  idPrefix: string,
): CollectionItemsTree {
  const dispatch = useDispatch();
  const getIcon = useGetIcon();
  const hasTenants = useSetting("use-tenants");

  const {
    data: rootItems,
    isLoading: isLoadingRootItems,
    error: rootItemsError,
  } = useListCollectionItemsQuery(getRootItemsRequest(itemModel));
  const {
    data: sharedTenantRootItems,
    isLoading: isLoadingSharedTenantRootItems,
    error: sharedTenantRootItemsError,
  } = useListCollectionItemsQuery(
    hasTenants ? getSharedTenantRootItemsRequest(itemModel) : skipToken,
  );
  const isLoading = isLoadingRootItems || isLoadingSharedTenantRootItems;
  const error = rootItemsError ?? sharedTenantRootItemsError;

  const [expandedCollectionIds, setExpandedCollectionIds] = useState<
    CollectionId[]
  >([]);
  const subscriptionsRef = useRef(
    new Map<CollectionId, { unsubscribe: () => void }>(),
  );

  useEffect(() => {
    const subscriptions = subscriptionsRef.current;
    expandedCollectionIds.forEach((expandedId) => {
      if (!subscriptions.has(expandedId)) {
        subscriptions.set(
          expandedId,
          dispatch(
            collectionApi.endpoints.listCollectionItems.initiate(
              getCollectionItemsRequest(expandedId, itemModel),
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
  }, [dispatch, expandedCollectionIds, itemModel]);

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
          getCollectionItemsRequest(expandedId, itemModel),
        ),
      ),
    [expandedCollectionIds, itemModel],
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

  const items = useMemo((): TreeItem[] | undefined => {
    if (isLoading || !rootItems) {
      return undefined;
    }
    const context = { itemModel, idPrefix, loadedCollections, getIcon };
    return [
      ...buildChildren(rootItems.data, context),
      ...buildChildren(sharedTenantRootItems?.data ?? NO_ITEMS, context),
    ];
  }, [
    isLoading,
    rootItems,
    sharedTenantRootItems,
    itemModel,
    idPrefix,
    loadedCollections,
    getIcon,
  ]);

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
          original.id.startsWith(idPrefix)
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
    [idPrefix],
  );

  const isChildrenLoading = useCallback(
    (row: Row<TreeItem>): boolean =>
      row.original.id.startsWith(idPrefix) &&
      row.getIsExpanded() &&
      row.getCanExpand() &&
      row.original.children?.length === 0,
    [idPrefix],
  );

  return {
    items,
    isLoading,
    error,
    watchRows,
    isChildrenLoading,
  };
}

type BuildContext = {
  itemModel: SemanticLayerItemModel;
  idPrefix: string;
  loadedCollections: Map<CollectionId, CollectionItem[]>;
  getIcon: ReturnType<typeof useGetIcon>;
};

/** Build children for a collection from its fetched items. Subcollections
 *  that haven't been loaded yet get `children: []` so they render as
 *  expandable rows that trigger a lazy load. */
function buildChildren(
  items: CollectionItem[],
  context: BuildContext,
): TreeItem[] {
  const { itemModel, idPrefix, loadedCollections, getIcon } = context;
  const visibleItems = items.filter((item) => !item.archived);
  const collections = visibleItems.filter(
    (item) => item.model === "collection" && hasItems(item, itemModel),
  );
  const leafItems = visibleItems.filter((item) => item.model === itemModel);

  return [
    ...collections.map((collection): TreeItem => {
      const childItems = loadedCollections.get(collection.id);
      const children =
        childItems !== undefined ? buildChildren(childItems, context) : [];

      return {
        name: collection.name,
        id: `${idPrefix}collection:${collection.id}`,
        icon: getIcon(collection).name,
        data: collection,
        model: "collection",
        children: children.length > 0 || !childItems ? children : undefined,
        childrenLoaded: childItems !== undefined,
      };
    }),
    ...leafItems.map(
      (leafItem): TreeItem => ({
        name: leafItem.name,
        updatedAt: leafItem["last-edit-info"]?.timestamp,
        icon: getIcon({ model: leafItem.model }).name,
        data: leafItem,
        id: `${leafItem.model}:${leafItem.id}`,
        model: leafItem.model,
      }),
    ),
  ];
}

function hasItems(
  collection: CollectionItem,
  itemModel: SemanticLayerItemModel,
): boolean {
  return (
    collection.here?.includes(itemModel) ||
    collection.below?.includes(itemModel) ||
    false
  );
}
