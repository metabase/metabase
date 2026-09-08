import { t } from "ttag";

import type { Collection, CollectionId } from "metabase-types/api";
import type { Crumb } from "metabase/common/components/Breadcrumbs";
import { isNotNull } from "metabase/utils/types";

export const findCollectionById = (
  collectionsTree?: Collection[],
  collectionId?: CollectionId,
): Collection | null => {
  if (!collectionsTree?.length || !collectionId) {
    return null;
  }

  const collection = collectionsTree.find((c) => c.id === collectionId);

  if (collection) {
    return collection;
  }

  return findCollectionById(
    collectionsTree.map((c) => c.children || []).flat(),
    collectionId,
  );
};

export const getCollectionBreadCrumbs = (
  collection: Collection | undefined,
  collectionsById: Partial<Record<CollectionId, Collection>>,
  callback: (id: CollectionId) => void,
): Crumb[] => {
  if (collection?.path) {
    return [
      ...collection.path
        .map((id) => collectionsById[id])
        .filter(isNotNull)
        .map(
          (collection): Crumb => [
            collection.name,
            () => callback(collection.id),
          ],
        ),
      [collection.name],
    ];
  }

  const rootCollection = collectionsById.root;
  if (!rootCollection) {
    return [[t`Unknown`]];
  }

  return [
    [rootCollection.name, () => callback(rootCollection.id)],
    [t`Unknown`],
  ];
};
