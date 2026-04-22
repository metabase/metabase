import { useEffect, useMemo, useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import {
  collectionApi,
  skipToken,
  useListCollectionItemsQuery,
} from "metabase/api";
import { useDebouncedValue } from "metabase/common/hooks/use-debounced-value";
import type {
  LibrarySectionType,
  TreeItem,
} from "metabase/data-studio/common/types";
import { createEmptyStateItem } from "metabase/data-studio/common/utils";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { getIcon } from "metabase/utils/icon";
import { useDispatch, useSelector } from "metabase/utils/redux";
import { getIsRemoteSyncReadOnly } from "metabase-enterprise/remote_sync/selectors";
import type {
  Collection,
  CollectionId,
  CollectionItem,
} from "metabase-types/api";

type ItemsByCollection = Map<CollectionId, CollectionItem[]>;

function buildItemNode(item: CollectionItem): TreeItem {
  return {
    name: item.name,
    updatedAt: item["last-edit-info"]?.timestamp,
    icon: getIcon({ model: item.model }).name,
    data: item,
    id: `${item.model}:${item.id}`,
    model: item.model,
  };
}

function buildCollectionNode(
  collectionItem: CollectionItem,
  itemsByCollectionId: ItemsByCollection,
): TreeItem {
  const childItems = itemsByCollectionId.get(collectionItem.id) ?? [];
  const childCollections = childItems.filter((i) => i.model === "collection");
  const leafItems = childItems.filter((i) => i.model !== "collection");

  const children: TreeItem[] = [
    ...childCollections.map((child) =>
      buildCollectionNode(child, itemsByCollectionId),
    ),
    ...leafItems.map(buildItemNode),
  ];

  return {
    name: collectionItem.name,
    id: `collection:${collectionItem.id}`,
    icon: "folder",
    data: collectionItem,
    model: "collection",
    children: children.length > 0 ? children : undefined,
  };
}

export const useBuildTreeForCollection = (
  collection: Collection | undefined,
  sectionType: LibrarySectionType,
  metricCollectionId?: CollectionId,
): {
  isLoading: boolean;
  tree: TreeItem[];
  error?: unknown;
} => {
  const dispatch = useDispatch();

  const {
    data: topLevelItems,
    isLoading: isLoadingTopLevel,
    error,
  } = useListCollectionItemsQuery(
    collection
      ? { id: collection.id, models: ["metric", "table", "collection"] }
      : skipToken,
  );
  const isRemoteSyncReadOnly = useSelector(getIsRemoteSyncReadOnly);

  // Collect IDs of subcollections found in the top-level items response
  const subcollectionIds = useMemo(() => {
    if (!topLevelItems) {
      return [];
    }
    return topLevelItems.data
      .filter((item) => item.model === "collection")
      .map((item) => item.id);
  }, [topLevelItems]);

  const [subcollectionItems, setSubcollectionItems] =
    useState<ItemsByCollection>(new Map());
  const [isLoadingSubcollections, setIsLoadingSubcollections] = useState(false);

  useEffect(() => {
    if (subcollectionIds.length === 0) {
      setSubcollectionItems(new Map());
      return;
    }

    let cancelled = false;
    setIsLoadingSubcollections(true);

    Promise.all(
      subcollectionIds.map(async (id) => {
        const result = await dispatch(
          collectionApi.endpoints.listCollectionItems.initiate({
            id,
            models: ["metric", "table", "collection"],
          }),
        );
        return [id, result.data?.data ?? []] as const;
      }),
    ).then((results) => {
      if (!cancelled) {
        setSubcollectionItems(new Map(results));
        setIsLoadingSubcollections(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [subcollectionIds, dispatch]);

  const isLoading = isLoadingTopLevel || isLoadingSubcollections;

  return useMemo(() => {
    if (isLoading || !topLevelItems || !collection) {
      return {
        isLoading,
        tree: [],
        error,
      };
    }

    const allItemsByCollection: ItemsByCollection = new Map([
      [collection.id, topLevelItems.data],
      ...subcollectionItems,
    ]);

    const topItems = topLevelItems.data;
    const topCollections = topItems.filter((i) => i.model === "collection");
    const topLeafItems = topItems.filter((i) => i.model !== "collection");

    const children: TreeItem[] = [
      ...topCollections.map((child) =>
        buildCollectionNode(child, allItemsByCollection),
      ),
      ...topLeafItems.map(buildItemNode),
    ];

    const hasContent = children.length > 0;

    return {
      isLoading,
      error,
      tree: [
        {
          name: collection.name,
          id: `collection:${collection.id}`,
          icon: getIcon({ ...collection, model: "collection" }).name,
          data: { ...collection, model: "collection" as const },
          model: "collection",
          children: hasContent
            ? children
            : [
                createEmptyStateItem(
                  sectionType,
                  metricCollectionId,
                  isRemoteSyncReadOnly,
                ),
              ],
        },
      ],
    };
  }, [
    isLoading,
    topLevelItems,
    collection,
    subcollectionItems,
    error,
    sectionType,
    metricCollectionId,
    isRemoteSyncReadOnly,
  ]);
};

export const useErrorHandling = (_error: unknown) => {
  const error = useDebouncedValue(_error, 1000);
  const { sendErrorToast } = useMetadataToasts();

  useEffect(() => {
    if (_.isObject(error) && typeof error?.data?.message === "string") {
      sendErrorToast(
        t`Data couldn't be fetched properly: ${error.data.message}`,
      );
    }
  }, [error, sendErrorToast]);
};
