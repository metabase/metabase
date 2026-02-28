import { t } from "ttag";

import type { Crumb } from "metabase/common/components/Breadcrumbs";
import { isNotNull } from "metabase/lib/types";
import type { Collection, CollectionId } from "metabase-types/api";

export const getCrumbs = (
  collection: Collection,
  collectionsById: Partial<Record<CollectionId, Collection>>,
  callback: (id: CollectionId) => void,
): Crumb[] => {
  if (collection && collection.path) {
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
      [collection.name] as Crumb,
    ];
  } else {
    const rootCollection = collectionsById.root;

    return [
      ...(rootCollection
        ? ([
            [rootCollection.name, () => callback(rootCollection.id)],
          ] as Crumb[])
        : []),
      [t`Unknown`] as Crumb,
    ];
  }
};
