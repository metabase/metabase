import { skipToken, useGetCollectionQuery } from "metabase/api";
import { getCollectionPath } from "metabase/common/collections/utils";
import type {
  Collection,
  CollectionEssentials,
  CollectionId,
} from "metabase-types/api";

import { getParentCollectionId } from "./utils";

type LibraryItemPathResult = {
  /** Root first, the item's own collection last; `undefined` until loaded */
  path: CollectionEssentials[] | undefined;
  isLoading: boolean;
  error: unknown;
};

/**
 * The collections from the root down to the one holding a Library item.
 * `null` is the root collection; `undefined` means there is no item yet, so
 * nothing is fetched. A folder trashed directly presents the Trash as its
 * ancestors, so its real ones come from its parent, which `location` still
 * names.
 */
export function useLibraryItemPath(
  collectionId: CollectionId | null | undefined,
): LibraryItemPathResult {
  const {
    currentData: collection,
    isFetching: isFetchingCollection,
    error: collectionError,
  } = useGetCollectionQuery(
    collectionId === undefined ? skipToken : { id: collectionId ?? "root" },
  );
  const parentId = collection?.archived_directly
    ? getParentCollectionId(collection.location)
    : undefined;
  const {
    currentData: parent,
    isFetching: isFetchingParent,
    error: parentError,
  } = useGetCollectionQuery(parentId != null ? { id: parentId } : skipToken);

  return {
    path: getPath(collection, parentId, parent),
    isLoading:
      (collection === undefined && isFetchingCollection) ||
      (parent === undefined && isFetchingParent),
    error: collectionError ?? parentError,
  };
}

function getPath(
  collection: Collection | undefined,
  parentId: CollectionId | undefined,
  parent: Collection | undefined,
): CollectionEssentials[] | undefined {
  if (collection == null) {
    return undefined;
  }
  if (parentId == null) {
    return getCollectionPath(collection);
  }
  if (parent == null) {
    return undefined;
  }
  return [...getCollectionPath(parent), collection];
}
