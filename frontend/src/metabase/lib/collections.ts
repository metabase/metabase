import { t } from "ttag";

import { isNotNull } from "metabase/lib/types";
import type { Collection, CollectionId } from "metabase-types/api";

export const getCrumbs = (
  collection: Collection,
  collectionsById: Partial<Record<CollectionId, Collection>>,
  callback: (id: CollectionId) => void,
) => {
  if (collection && collection.path) {
    return [
      ...collection.path
        .map(id => collectionsById[id])
        .filter(isNotNull)
        .map(collection => [collection.name, () => callback(collection.id)]),
      [collection.name],
    ];
  } else {
    const rootCollection = collectionsById.root;

    return [
      ...(rootCollection
        ? [[rootCollection.name, () => callback(rootCollection.id)]]
        : []),
      [t`Unknown`],
    ];
  }
};
