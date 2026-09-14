import { isRootCollection } from "metabase/common/collections/utils";
import type {
  Collection,
  CollectionEssentials,
  CollectionId,
} from "metabase-types/api";

import type { BreadcrumbCrumb } from "./CollectionBreadcrumbsView";

type GetCollectionListProps = {
  collection: Collection;
  baseCollectionId?: CollectionId | null;
};

export const getCollectionList = ({
  baseCollectionId = null,
  collection,
}: GetCollectionListProps) => {
  // baseCollectionId can be either a numeric or entity id
  if (
    baseCollectionId &&
    (collection.id === baseCollectionId ||
      collection.entity_id === baseCollectionId)
  ) {
    return [];
  }

  const ancestors = collection.effective_ancestors || [];
  const hasRoot = ancestors[0] && isRootCollection(ancestors[0]);
  const [_root, ...crumbsWithoutRoot] = ancestors;

  const baseIndex = baseCollectionId
    ? ancestors.findIndex((part) => part.id === baseCollectionId)
    : -1;

  if (baseIndex >= 0) {
    return ancestors.slice(baseIndex);
  } else {
    return hasRoot ? crumbsWithoutRoot : ancestors;
  }
};

type CollectionToCrumbsProps = GetCollectionListProps & {
  onClick?: (collection: CollectionEssentials) => void;
};

export const collectionToCrumbs = ({
  collection,
  baseCollectionId = null,
  onClick,
}: CollectionToCrumbsProps): BreadcrumbCrumb[] =>
  [...getCollectionList({ baseCollectionId, collection }), collection].map(
    (part) => ({
      kind: "collection" as const,
      collection: part,
      onClick: onClick ? () => onClick(part) : undefined,
    }),
  );
