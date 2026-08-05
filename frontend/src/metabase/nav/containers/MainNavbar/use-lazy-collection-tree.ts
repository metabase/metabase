import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { collectionApi, useListCollectionsTreeQuery } from "metabase/api";
import { useDispatch, useSelector } from "metabase/redux";
import type { State } from "metabase/redux/store";
import type {
  Collection,
  CollectionId,
  ListCollectionsTreeRequest,
  RegularCollectionId,
} from "metabase-types/api";

type NodeId = CollectionId;

const childrenRequest = (
  baseRequest: ListCollectionsTreeRequest,
  collectionId: RegularCollectionId,
): ListCollectionsTreeRequest => ({
  ...baseRequest,
  lazy: true,
  "collection-id": collectionId,
});

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
 * Grafts fetched children onto the nodes the backend returned without them.
 *
 * Only nodes flagged `has_children` with no `children` are grafted onto. Anything else already knows its own
 * children, so consulting the fetched map for it could splice a node in under itself.
 */
const attachLoadedChildren = (
  collections: Collection[],
  childrenById: Map<RegularCollectionId, Collection[]>,
): Collection[] =>
  collections.map((collection) => {
    const awaitsChildren =
      collection.children == null && collection.has_children === true;

    const children = awaitsChildren
      ? isFetchableId(collection.id)
        ? childrenById.get(collection.id)
        : undefined
      : collection.children;

    return {
      ...collection,
      children: children && attachLoadedChildren(children, childrenById),
    };
  });

/**
 * Drives the lazily loaded nav sidebar collection tree.
 *
 * The first request adapts to the size of the instance. A small instance gets its whole tree back and nothing here
 * ever fetches again, because every node arrives with its children already attached. A large instance gets the root
 * level plus the path down to `selectedCollectionId`, and this hook fetches the rest one level at a time as the user
 * expands nodes.
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

  const expandTo =
    selectedCollectionId != null && isFetchableId(selectedCollectionId)
      ? selectedCollectionId
      : undefined;

  const {
    data: collections = [],
    isLoading,
    error,
  } = useListCollectionsTreeQuery({
    ...baseRequest,
    lazy: true,
    "expand-to": expandTo,
  });

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

  const expandableIds = useMemo(
    () => [...expandedIds].filter(isFetchableId),
    [expandedIds],
  );

  // Read the cache for every expanded node, not just the ones we fetch. Deciding what to fetch depends on the merged
  // tree below, so narrowing this first would make the two circular.
  const loadedChildren = useSelector(
    (state: State) =>
      expandableIds.map((id) => ({
        id,
        children: collectionApi.endpoints.listCollectionsTree.select(
          childrenRequest(baseRequest, id),
        )(state).data,
      })),
    (previous, next) =>
      previous.length === next.length &&
      previous.every(
        (entry, index) =>
          entry.id === next[index].id &&
          entry.children === next[index].children,
      ),
  );

  const tree = useMemo(() => {
    const childrenById = new Map<RegularCollectionId, Collection[]>();
    loadedChildren.forEach(({ id, children }) => {
      if (children) {
        childrenById.set(id, children);
      }
    });
    return attachLoadedChildren(collections, childrenById);
  }, [collections, loadedChildren]);

  // Taken from the merged tree, so a node whose children arrived inside a parent's lookahead counts as loaded. Taking
  // it from the first response instead would re-fetch what the server already sent.
  const idsAwaitingChildren = useMemo(
    () => collectIdsAwaitingChildren(tree),
    [tree],
  );

  // Nodes we hold a subscription for: those still waiting on children, plus those whose children came from a fetch of
  // their own. Dropping the second group the moment their data arrived would let RTK collect it and start the fetch
  // over again.
  const subscribedIds = useMemo(() => {
    const fetchedForItself = new Set(
      loadedChildren
        .filter(({ children }) => children != null)
        .map(({ id }) => id),
    );
    return expandableIds.filter(
      (id) => idsAwaitingChildren.has(id) || fetchedForItself.has(id),
    );
  }, [expandableIds, idsAwaitingChildren, loadedChildren]);

  // Subscribe rather than fire and forget, so the cache entries stay alive and stay in step with tag invalidation
  // when a collection is created, renamed, moved or archived.
  useEffect(() => {
    const subscriptions = subscribedIds.map((id) =>
      dispatch(
        collectionApi.endpoints.listCollectionsTree.initiate(
          childrenRequest(baseRequest, id),
        ),
      ),
    );
    return () => {
      subscriptions.forEach((subscription) => subscription.unsubscribe());
    };
  }, [dispatch, subscribedIds, baseRequest]);

  // Warm the cache before the click arrives. Unsubscribed on purpose: RTK keeps the entry around long enough for the
  // click that follows, and if the click never comes it is collected rather than kept in sync forever.
  const prefetchChildren = useCallback(
    (id: NodeId) => {
      if (!isFetchableId(id) || !idsAwaitingChildren.has(id)) {
        return;
      }
      dispatch(
        collectionApi.endpoints.listCollectionsTree.initiate(
          childrenRequest(baseRequest, id),
          { subscribe: false },
        ),
      );
    },
    [dispatch, baseRequest, idsAwaitingChildren],
  );

  const toggleExpand = useCallback((id: NodeId) => {
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

  return {
    collections: tree,
    expandedIds,
    toggleExpand,
    prefetchChildren,
    isLoading,
    error,
  };
}
