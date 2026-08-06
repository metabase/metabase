import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { collectionApi, useListCollectionsTreeLazyQuery } from "metabase/api";
import { useDispatch, useSelector } from "metabase/redux";
import type { State } from "metabase/redux/store";
import type {
  Collection,
  CollectionId,
  ListCollectionsTreeRequest,
  RegularCollectionId,
} from "metabase-types/api";

type NodeId = CollectionId;

/** A level of the tree: either the top level, or the children of one collection. */
type LevelKey = RegularCollectionId | "root";

const ROOT_LEVEL: LevelKey = "root";

/** The offset of a level's first page, which is the only request that also carries `expand-to`. */
const FIRST_PAGE_OFFSET = 0;

type Level = {
  items: Collection[];
  hasMore: boolean;
  nextOffset: number;
  isLoadingMore: boolean;
  /** How many rows a page holds. */
  pageSize: number;
  /** Rows of this level that sit above the window, whose height the list reserves ahead of the rows it has. */
  startOffset: number;
  /** Rows of this level that sit below the window, whose height the list reserves after the rows it has. */
  remaining: number;
  /** Every row the level holds, read or not. */
  total: number;
};

/**
 * A node is only worth fetching when it is a real collection. Synthetic nodes such as the root collection and the
 * trash have no children in this tree.
 */
const isFetchableId = (id: NodeId): id is RegularCollectionId =>
  typeof id === "number";

/**
 * Ids that have children the tree does not hold yet, at any depth. Everything else is already renderable, whether it
 * arrived in the first response, in its own fetch, or inside a parent's lookahead.
 */
const collectIdsAwaitingChildren = (
  collections: Collection[],
  into: Set<RegularCollectionId> = new Set(),
): Set<RegularCollectionId> => {
  collections.forEach((collection) => {
    if (collection.children == null) {
      if (collection.has_children === true && isFetchableId(collection.id)) {
        into.add(collection.id);
      }
      return;
    }
    collectIdsAwaitingChildren(collection.children, into);
  });
  return into;
};

/**
 * Grafts fetched levels onto the nodes the backend returned without them, and lets a level we have paged override the
 * `children_has_more` the server sent with the first page.
 */
const attachLevels = (
  collections: Collection[],
  levels: Map<LevelKey, Level>,
): Collection[] =>
  collections.map((collection) => {
    const level = isFetchableId(collection.id)
      ? levels.get(collection.id)
      : undefined;

    const awaitsChildren =
      collection.children == null && collection.has_children === true;

    const children = awaitsChildren ? level?.items : collection.children;

    return {
      ...collection,
      children: children && attachLevels(children, levels),
      children_has_more: level ? level.hasMore : collection.children_has_more,
    };
  });

/**
 * Drives the lazily loaded nav sidebar collection tree.
 *
 * The first request adapts to the size of the instance. A small instance gets its whole tree back and nothing here
 * ever fetches again. A large instance gets one page of the root level plus the path down to `selectedCollectionId`,
 * and this hook fetches further levels as nodes expand and further pages as the user asks for them.
 */
export function useLazyCollectionTree({
  baseRequest,
  selectedCollectionId,
  ancestorIds,
}: {
  baseRequest: ListCollectionsTreeRequest;
  selectedCollectionId?: CollectionId;
  ancestorIds: NodeId[];
}) {
  const dispatch = useDispatch();
  const [expandedIds, setExpandedIds] = useState<Set<NodeId>>(new Set());
  // The pages a level currently holds, by offset, contiguous and ascending. A level starts at its first page and
  // grows as the reader reaches the end of it. Jumping somewhere far off replaces the run rather than walking there,
  // so a level the size of the whole instance costs one request to look at wherever the reader landed.
  const [windowByLevel, setWindowByLevel] = useState<Map<LevelKey, number[]>>(
    new Map(),
  );

  const expandTo =
    selectedCollectionId != null && isFetchableId(selectedCollectionId)
      ? selectedCollectionId
      : undefined;

  const firstPageRequest = useCallback(
    (key: LevelKey): ListCollectionsTreeRequest =>
      key === ROOT_LEVEL
        ? { ...baseRequest, "expand-to": expandTo }
        : { ...baseRequest, "collection-id": key },
    [baseRequest, expandTo],
  );

  const laterPageRequest = useCallback(
    (key: LevelKey, offset: number): ListCollectionsTreeRequest =>
      key === ROOT_LEVEL
        ? { ...baseRequest, "level-offset": offset }
        : { ...baseRequest, "collection-id": key, "level-offset": offset },
    [baseRequest],
  );

  const pageRequest = useCallback(
    (key: LevelKey, offset: number): ListCollectionsTreeRequest =>
      offset === 0 ? firstPageRequest(key) : laterPageRequest(key, offset),
    [firstPageRequest, laterPageRequest],
  );

  const levelWindow = useCallback(
    (key: LevelKey): number[] => windowByLevel.get(key) ?? [FIRST_PAGE_OFFSET],
    [windowByLevel],
  );

  const { isLoading, error } = useListCollectionsTreeLazyQuery(
    firstPageRequest(ROOT_LEVEL),
  );

  // Reveal the collection the user is looking at, however deep it sits.
  //
  // Keyed on the path rather than on the collection, so that a refetch which returns the same path does not spring
  // open nodes the user deliberately collapsed, while a genuine change of path (the collection was moved) does
  // reveal it again in its new home.
  const revealedPath = useRef<string>();
  useEffect(() => {
    const path = ancestorIds.join(",");
    if (
      ancestorIds.length === 0 ||
      selectedCollectionId == null ||
      revealedPath.current === path
    ) {
      return;
    }
    revealedPath.current = path;
    setExpandedIds((previous) => new Set([...previous, ...ancestorIds]));
  }, [ancestorIds, selectedCollectionId]);

  const levelKeys = useMemo(
    (): LevelKey[] => [ROOT_LEVEL, ...[...expandedIds].filter(isFetchableId)],
    [expandedIds],
  );

  // Read the cache for every level in play, not just the ones we fetch. Deciding what to fetch depends on the merged
  // tree below, so narrowing this first would make the two circular.
  const pagesByLevel = useSelector(
    (state: State) =>
      levelKeys.map((key) => {
        const requests = levelWindow(key).map((offset) =>
          pageRequest(key, offset),
        );
        return {
          key,
          pages: requests.map(
            (request) =>
              collectionApi.endpoints.listCollectionsTreeLazy.select(request)(
                state,
              ).data,
          ),
        };
      }),
    (previous, next) =>
      previous.length === next.length &&
      previous.every(
        (entry, index) =>
          entry.key === next[index].key &&
          entry.pages.length === next[index].pages.length &&
          entry.pages.every((page, at) => page === next[index].pages[at]),
      ),
  );

  // Navigating changes `expand-to`, which is part of the root request's cache key, so the root level is briefly
  // absent while the new one is in flight. Holding the last one keeps the sidebar on screen instead of emptying it
  // every time the user opens a collection.
  const lastRootLevel = useRef<Level>();

  const levels = useMemo(() => {
    const byKey = new Map<LevelKey, Level>();
    pagesByLevel.forEach(({ key, pages }) => {
      // Up to the first page still in flight, rather than every page that happens to be in the cache. Only the first
      // page of the root level carries `expand-to`, so navigating re-keys that page alone and leaves the later ones
      // behind. Rendering those on their own would drop the top of the list.
      const gapAt = pages.findIndex((page) => page == null);
      const loaded = (gapAt === -1 ? pages : pages.slice(0, gapAt)).filter(
        (page) => page != null,
      );
      if (loaded.length === 0) {
        return;
      }
      const last = loaded[loaded.length - 1];
      const items = loaded.flatMap((page) => page.data);
      const startOffset = levelWindow(key)[0];
      byKey.set(key, {
        items,
        hasMore: last.has_more,
        nextOffset: last.next_offset,
        isLoadingMore: loaded.length < pages.length,
        // Measured from the window's own first page, which no longer has to be the level's first page.
        pageSize: loaded[0].next_offset - startOffset,
        startOffset,
        remaining: Math.max(last.total - (startOffset + items.length), 0),
        total: last.total,
      });
    });

    const root = byKey.get(ROOT_LEVEL);
    if (root) {
      lastRootLevel.current = root;
    } else if (lastRootLevel.current) {
      byKey.set(ROOT_LEVEL, lastRootLevel.current);
    }
    return byKey;
  }, [pagesByLevel, levelWindow]);

  const tree = useMemo(
    () => attachLevels(levels.get(ROOT_LEVEL)?.items ?? [], levels),
    [levels],
  );

  // Taken from the merged tree, so a node whose children arrived inside a parent's lookahead counts as loaded. Taking
  // it from the first response instead would re-fetch what the server already sent.
  const idsAwaitingChildren = useMemo(
    () => collectIdsAwaitingChildren(tree),
    [tree],
  );

  // Levels we hold a subscription for: those still waiting on children, plus those already fetched for themselves.
  // Dropping the second group the moment their data arrived would let RTK collect it and start the fetch over again.
  const subscribedRequests = useMemo(() => {
    const requests: ListCollectionsTreeRequest[] = [];
    levelKeys.forEach((key) => {
      levelWindow(key).forEach((offset) => {
        // The root's own first page is already subscribed by the query above, and a node's first page is only worth
        // holding while it is still waiting on children or has been read for itself.
        const isRootFirstPage =
          key === ROOT_LEVEL && offset === FIRST_PAGE_OFFSET;
        const isUnwantedNodeFirstPage =
          offset === FIRST_PAGE_OFFSET &&
          key !== ROOT_LEVEL &&
          !(idsAwaitingChildren.has(key) || levels.has(key));
        if (isRootFirstPage || isUnwantedNodeFirstPage) {
          return;
        }
        requests.push(pageRequest(key, offset));
      });
    });
    return requests;
  }, [levelKeys, idsAwaitingChildren, levels, levelWindow, pageRequest]);

  useEffect(() => {
    const subscriptions = subscribedRequests.map((request) =>
      dispatch(
        collectionApi.endpoints.listCollectionsTreeLazy.initiate(request),
      ),
    );
    return () => {
      subscriptions.forEach((subscription) => subscription.unsubscribe());
    };
  }, [dispatch, subscribedRequests]);

  // Warm the cache before the click arrives. Unsubscribed on purpose: RTK keeps the entry around long enough for the
  // click that follows, and if the click never comes it is collected rather than kept in sync forever.
  const prefetchChildren = useCallback(
    (id: NodeId) => {
      if (!isFetchableId(id) || !idsAwaitingChildren.has(id)) {
        return;
      }
      dispatch(
        collectionApi.endpoints.listCollectionsTreeLazy.initiate(
          firstPageRequest(id),
          { subscribe: false },
        ),
      );
    },
    [dispatch, firstPageRequest, idsAwaitingChildren],
  );

  const handleToggleExpand = useCallback((id: NodeId) => {
    setExpandedIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const collapse = useCallback((id: NodeId) => {
    setExpandedIds((previous) => {
      const next = new Set(previous);
      next.delete(id);
      return next;
    });
  }, []);

  const levelKeyFor = (parentId: NodeId | null): LevelKey =>
    parentId == null || !isFetchableId(parentId) ? ROOT_LEVEL : parentId;

  /** Grow a level by the page that follows the ones it holds. */
  const loadMore = useCallback(
    (parentId: NodeId | null) => {
      const key = levelKeyFor(parentId);
      const level = levels.get(key);
      if (!level?.hasMore || level.isLoadingMore) {
        return;
      }
      setWindowByLevel((previous) => {
        const offsets = previous.get(key) ?? [FIRST_PAGE_OFFSET];
        // Anything watching the end of a level can ask for the next page, and more than one of them can ask in the
        // same commit, each reading the same `nextOffset` from the level it rendered with. Asking once is what keeps
        // a burst of those from turning into a burst of pages, and the same rows from arriving twice.
        if (offsets.includes(level.nextOffset)) {
          return previous;
        }
        const next = new Map(previous);
        next.set(key, [...offsets, level.nextOffset]);
        return next;
      });
    },
    [levels],
  );

  /**
   * Move a level to the page holding `rowIndex`, dropping the pages it held.
   *
   * Walking there a page at a time would be one request per page, and a level as wide as this instance puts most of
   * its rows hundreds of pages from either end. Reading the one page the reader is actually looking at costs one.
   */
  const jumpTo = useCallback(
    (parentId: NodeId | null, rowIndex: number) => {
      const key = levelKeyFor(parentId);
      const level = levels.get(key);
      if (!level || level.pageSize <= 0) {
        return;
      }
      const lastPageOffset =
        Math.max(Math.ceil(level.total / level.pageSize) - 1, 0) *
        level.pageSize;
      const offset = Math.min(
        Math.max(Math.floor(rowIndex / level.pageSize) * level.pageSize, 0),
        lastPageOffset,
      );
      setWindowByLevel((previous) => {
        const offsets = previous.get(key) ?? [FIRST_PAGE_OFFSET];
        if (offsets.length === 1 && offsets[0] === offset) {
          return previous;
        }
        const next = new Map(previous);
        next.set(key, [offset]);
        return next;
      });
    },
    [levels],
  );

  // Every level that was cut short, keyed the way the tree asks for it. The list gives the unread rows their height
  // so it is as tall as it will ever be, and the scrollbar stops moving as pages arrive.
  const remainingByLevel = useMemo(() => {
    const remaining = new Map<NodeId | null, number>();
    levels.forEach((level, key) => {
      remaining.set(key === ROOT_LEVEL ? null : key, level.remaining);
    });
    return remaining;
  }, [levels]);

  // Rows sitting above each level's window, whose height the list reserves so that jumping into a level leaves the
  // rows before it where they were rather than pulling everything to the top.
  const startOffsetByLevel = useMemo(() => {
    const starts = new Map<NodeId | null, number>();
    levels.forEach((level, key) => {
      starts.set(key === ROOT_LEVEL ? null : key, level.startOffset);
    });
    return starts;
  }, [levels]);

  const loadingMoreIds = useMemo(() => {
    const ids = new Set<NodeId | null>();
    levels.forEach((level, key) => {
      if (level.isLoadingMore) {
        ids.add(key === ROOT_LEVEL ? null : key);
      }
    });
    return ids;
  }, [levels]);

  return {
    collections: tree,
    expandedIds,
    setExpandedIds,
    handleToggleExpand,
    collapse,
    prefetchChildren,
    loadMore,
    loadingMoreIds,
    remainingByLevel,
    startOffsetByLevel,
    jumpTo,
    hasMore: levels.get(ROOT_LEVEL)?.hasMore ?? false,
    pageSize: levels.get(ROOT_LEVEL)?.pageSize,
    isLoading,
    error,
  };
}
