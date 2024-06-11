import { isRootCollection } from "metabase/collections/utils";
import type { Collection, CollectionId } from "metabase-types/api";

type GetCollectionListProps = {
  collection: Collection;
  baseCollectionId?: CollectionId | null;
};

export const getCollectionList = ({
  baseCollectionId = null,
  collection,
}: GetCollectionListProps) => {
  if (baseCollectionId && collection.id === baseCollectionId) {
    return [];
  }

  const ancestors = collection.effective_ancestors || [];
  const hasRoot = ancestors[0] && isRootCollection(ancestors[0]);
  const [_, ...crumbsWithoutRoot] = ancestors;

  const baseIndex = baseCollectionId
    ? ancestors.findIndex(part => part.id === baseCollectionId)
    : -1;

  if (baseIndex > 0) {
    const index = ancestors.findIndex(part => part.id === baseCollectionId);
    return ancestors.slice(index);
  } else {
    return hasRoot ? crumbsWithoutRoot : ancestors;
  }
};
