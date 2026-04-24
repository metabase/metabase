import type { Row } from "@tanstack/react-table";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import {
  collectionApi,
  skipToken,
  useListCollectionItemsQuery,
  useSearchQuery,
} from "metabase/api";
import { useDebouncedValue } from "metabase/common/hooks/use-debounced-value";
import type {
  LibrarySectionType,
  TreeItem,
} from "metabase/data-studio/common/types";
import {
  createEmptyStateItem,
  isEmptyStateData,
} from "metabase/data-studio/common/utils";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { getIcon } from "metabase/utils/icon";
import { useDispatch, useSelector } from "metabase/utils/redux";
import { getIsRemoteSyncReadOnly } from "metabase-enterprise/remote_sync/selectors";
import type {
  Collection,
  CollectionId,
  CollectionItem,
} from "metabase-types/api";

// ── pure helpers ──

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

function hasContent(item: CollectionItem): boolean {
  return (
    (item.here != null && item.here.length > 0) ||
    (item.below != null && item.below.length > 0)
  );
}

/** Build children for a collection from its fetched items. Subcollections
 *  that haven't been loaded yet get `children: []` (if they have content
 *  according to `here`/`below`) so they render as expandable rows that
 *  trigger a lazy load, or `undefined` if they're empty. */
function buildChildren(
  items: CollectionItem[],
  loadedCollections: Map<CollectionId, CollectionItem[]>,
): TreeItem[] {
  const collections = items.filter((i) => i.model === "collection");
  const leafItems = items.filter((i) => i.model !== "collection");

  return [
    ...collections.map((col): TreeItem => {
      const childItems = loadedCollections.get(col.id);
      let children: TreeItem[] | undefined;

      if (childItems !== undefined) {
        const built = buildChildren(childItems, loadedCollections);
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
      };
    }),
    ...leafItems.map(buildItemNode),
  ];
}

// ── hooks ──

export function useLibraryCollectionTree(
  collection: Collection | undefined,
  sectionType: LibrarySectionType,
  metricCollectionId?: CollectionId,
) {
  const dispatch = useDispatch();

  // 1. Fetch top-level items
  const {
    data: topLevelItems,
    isLoading,
    error,
  } = useListCollectionItemsQuery(
    collection
      ? { id: collection.id, models: ["metric", "table", "collection"] }
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
  }, [collection?.id]);

  const loadCollectionItems = useCallback(
    async (collectionId: CollectionId) => {
      const key = String(collectionId);
      if (loadingIds.current.has(key)) {
        return;
      }
      loadingIds.current.add(key);

      const result = await dispatch(
        collectionApi.endpoints.listCollectionItems.initiate({
          id: collectionId,
          models: ["metric", "table", "collection"],
        }),
      );
      const items = result.data?.data ?? [];
      setLoadedCollections((prev) => new Map([...prev, [collectionId, items]]));
    },
    [dispatch],
  );

  // 3. Build tree
  const tree = useMemo((): TreeItem[] => {
    if (isLoading || !topLevelItems || !collection) {
      return [];
    }

    const children = buildChildren(topLevelItems.data, loadedCollections);
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

  return { tree, isLoading, error, watchRows, isChildrenLoading };
}

const SEARCH_DEBOUNCE_MS = 300;

function filterSnippetTree(nodes: TreeItem[], query: string): TreeItem[] {
  const lowerQuery = query.toLowerCase();

  return nodes.flatMap((node) => {
    if (node.model === "snippet") {
      return node.name.toLowerCase().includes(lowerQuery) ? [node] : [];
    }

    if (node.children) {
      const filteredChildren = filterSnippetTree(node.children, query);
      if (filteredChildren.length > 0) {
        return [{ ...node, children: filteredChildren }];
      }
    }

    return [];
  });
}

export function useLibrarySearch(
  searchQuery: string,
  libraryCollectionId: CollectionId | undefined,
  snippetTree: TreeItem[],
) {
  const debouncedQuery = useDebouncedValue(searchQuery, SEARCH_DEBOUNCE_MS);
  const isActive = debouncedQuery.trim().length > 0;

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
          models: ["table", "metric"],
        }
      : skipToken,
  );

  const tree = useMemo((): TreeItem[] => {
    if (!isActive) {
      return [];
    }

    const sections: TreeItem[] = [];

    if (searchResponse) {
      const dataItems: TreeItem[] = [];
      const metricItems: TreeItem[] = [];

      for (const result of searchResponse.data) {
        const item: TreeItem = {
          id: `${result.model}:${result.id}`,
          name: result.name,
          icon: getIcon({ model: result.model }).name,
          updatedAt: result.last_edited_at ?? result.updated_at,
          model: result.model as TreeItem["model"],
          parentCollectionName: result.collection?.name,
          data: {
            id: result.id,
            model: result.model,
            name: result.name,
            description: result.description,
            archived: result.archived ?? false,
            collection_position: result.collection_position,
            "last-edit-info": result["last-edit-info"],
          } as CollectionItem,
        };

        if (result.model === "table") {
          dataItems.push(item);
        } else if (result.model === "metric") {
          metricItems.push(item);
        }
      }

      if (dataItems.length > 0) {
        sections.push({
          id: "search-section:data",
          name: t`Data`,
          icon: "table",
          model: "collection",
          data: { model: "collection" } as CollectionItem,
          children: dataItems,
        });
      }

      if (metricItems.length > 0) {
        sections.push({
          id: "search-section:metrics",
          name: t`Metrics`,
          icon: "metric",
          model: "collection",
          data: { model: "collection" } as CollectionItem,
          children: metricItems,
        });
      }
    }

    // Client-side filter snippets
    const filteredSnippets = filterSnippetTree(snippetTree, searchQuery);
    sections.push(...filteredSnippets);

    return sections;
  }, [isActive, searchResponse, snippetTree, searchQuery]);

  return {
    tree,
    isActive,
    isLoading: isLoading || isFetching,
    error,
  };
}

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
