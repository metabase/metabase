import type { Row } from "@tanstack/react-table";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  collectionApi,
  skipToken,
  useListCollectionItemsQuery,
} from "metabase/api";
import type { IconData, ObjectWithModel } from "metabase/common/utils/icon";
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

const LIBRARY_ITEM_MODELS = ["metric", "table", "collection"] as const;

type GetIcon = (item: ObjectWithModel) => IconData;

/** Builds the whole Library subtree from the Library root collection. The root itself is not
 *  rendered: its children — the seeded Data and Metrics folders plus any folders the user created —
 *  become the top-level rows. Everything below them is loaded lazily when a row is expanded. */
export function useLibraryCollectionTree(
  libraryCollection: Collection | undefined,
) {
  const dispatch = useDispatch();
  const getIcon = useGetIcon();

  // 1. Fetch the Library root's children
  const {
    data: topLevelItems,
    isLoading,
    error,
  } = useListCollectionItemsQuery(
    libraryCollection
      ? {
          id: libraryCollection.id,
          models: [...LIBRARY_ITEM_MODELS],
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
  }, [libraryCollection]);

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
            models: [...LIBRARY_ITEM_MODELS],
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
        loadingIds.current.delete(String(id));
      }
      await Promise.all(collectionIds.map(loadCollectionItems));
    },
    [loadCollectionItems],
  );

  // 3. Build tree
  const tree = useMemo((): TreeItem[] => {
    if (isLoading || !topLevelItems || !libraryCollection) {
      return [];
    }

    return sortTopLevelRows(
      buildChildren(
        topLevelItems.data,
        loadedCollections,
        getIcon,
        isRemoteSyncReadOnly,
      ),
    );
  }, [
    isLoading,
    topLevelItems,
    libraryCollection,
    loadedCollections,
    getIcon,
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
  getIcon: GetIcon,
  isRemoteSyncReadOnly: boolean,
): TreeItem[] {
  const visibleItems = items.filter((i) => !i.archived);
  const collections = visibleItems.filter((i) => i.model === "collection");
  const leafItems = visibleItems.filter((i) => i.model !== "collection");

  return [
    ...collections.map((col): TreeItem => {
      const childItems = loadedCollections.get(col.id);
      let children: TreeItem[] | undefined;

      if (childItems !== undefined) {
        const built = buildChildren(
          childItems,
          loadedCollections,
          getIcon,
          isRemoteSyncReadOnly,
        );
        children = built.length > 0 ? built : undefined;
      } else if (hasContent(col)) {
        children = [];
      }

      // `children === undefined` means "resolved and empty" — either the fetch came back empty or
      // `here`/`below` told us there is nothing to fetch. The seeded Data/Metrics sections show a
      // pitch + call to action in that state instead of collapsing to a bare row.
      const sectionType = getSeededSectionType(col);
      if (children === undefined && sectionType != null) {
        children = [
          createEmptyStateItem(sectionType, col.id, isRemoteSyncReadOnly),
        ];
      }

      return {
        name: col.name,
        id: `collection:${col.id}`,
        icon: getIcon({ ...col, model: "collection" }).name,
        data: col,
        model: "collection",
        children,
        childrenLoaded: childItems !== undefined,
      };
    }),
    ...leafItems.map((leafItem) => buildItemNode(leafItem, getIcon)),
  ];
}

function buildItemNode(item: CollectionItem, getIcon: GetIcon): TreeItem {
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

/** The `LibrarySectionType` of a seeded Library section, or null for user-created folders. */
function getSeededSectionType(item: CollectionItem): LibrarySectionType | null {
  if (!item.is_library_root) {
    return null;
  }
  if (item.type === "library-data") {
    return "data";
  }
  if (item.type === "library-metrics") {
    return "metrics";
  }
  return null;
}

/** Sort rank of the seeded sections; everything the user created sorts after them. */
const SEEDED_SECTION_RANK: Record<string, number> = {
  "library-data": 0,
  "library-metrics": 1,
};
const UNRANKED = 2;

/** Data and Metrics always lead; user-created top-level folders follow, alphabetically. */
function sortTopLevelRows(rows: TreeItem[]): TreeItem[] {
  const rankOf = ({ data }: TreeItem) => {
    if (isEmptyStateData(data) || !("is_library_root" in data)) {
      return UNRANKED;
    }
    return data.is_library_root
      ? (SEEDED_SECTION_RANK[String(data.type)] ?? UNRANKED)
      : UNRANKED;
  };

  return [...rows].sort(
    (a, b) => rankOf(a) - rankOf(b) || a.name.localeCompare(b.name),
  );
}
