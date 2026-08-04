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
 * Ids the response already carries children for, at any depth. Expanding one of these needs no request.
 */
const collectIdsWithLoadedChildren = (
  collections: Collection[],
  into: Set<RegularCollectionId> = new Set(),
): Set<RegularCollectionId> => {
  collections.forEach((collection) => {
    if (Array.isArray(collection.children)) {
      if (isFetchableId(collection.id)) {
        into.add(collection.id);
      }
      collectIdsWithLoadedChildren(collection.children, into);
    }
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

  // Nodes the first response already delivered children for. On a small instance that is every node, so expanding
  // never goes back to the server.
  const idsWithLoadedChildren = useMemo(
    () => collectIdsWithLoadedChildren(collections),
    [collections],
  );

  const fetchableExpandedIds = useMemo(
    () =>
      [...expandedIds].filter(
        (id) => isFetchableId(id) && !idsWithLoadedChildren.has(id),
      ),
    [expandedIds, idsWithLoadedChildren],
  );

  // Subscribe rather than fire and forget, so the cache entries stay alive and stay in step with tag invalidation
  // when a collection is created, renamed, moved or archived.
  useEffect(() => {
    const subscriptions = fetchableExpandedIds.map((id) =>
      dispatch(
        collectionApi.endpoints.listCollectionsTree.initiate(
          childrenRequest(baseRequest, id),
        ),
      ),
    );
    return () => {
      subscriptions.forEach((subscription) => subscription.unsubscribe());
    };
  }, [dispatch, fetchableExpandedIds, baseRequest]);

  const loadedChildren = useSelector(
    (state: State) =>
      fetchableExpandedIds.map((id) => ({
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

  return { collections: tree, expandedIds, toggleExpand, isLoading, error };
}
