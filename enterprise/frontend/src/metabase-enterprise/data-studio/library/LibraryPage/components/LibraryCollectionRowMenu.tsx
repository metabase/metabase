import { useCallback } from "react";
import { t } from "ttag";
import _ from "underscore";

import { CollectionRowMenu } from "metabase/collections/components/CollectionRowMenu";
import type { Collection, CollectionId } from "metabase-types/api";

type LibraryCollectionRowMenuProps = {
  childCount: number;
  collection: Collection;
  refreshMetricCollections: (collectionIds: CollectionId[]) => void;
  refreshTableCollections: (collectionIds: CollectionId[]) => void;
};

export function LibraryCollectionRowMenu(props: LibraryCollectionRowMenuProps) {
  const {
    childCount,
    collection,
    refreshMetricCollections,
    refreshTableCollections,
  } = props;
  const isLibraryDataCollection =
    collection.type === "library-data" && !collection.is_library_root;
  const refreshCollections = useCallback(
    (collectionIds: CollectionId[]) => {
      if (collection.type === "library-metrics") {
        refreshMetricCollections(collectionIds);
      }

      if (collection.type === "library-data") {
        refreshTableCollections(collectionIds);
      }
    },
    [refreshMetricCollections, refreshTableCollections, collection.type],
  );

  const onArchiveSuccess = useCallback(() => {
    const parentId = getParentCollectionId(collection);

    if (parentId == null) {
      return;
    }

    refreshCollections([parentId]);
  }, [collection, refreshCollections]);

  return (
    <CollectionRowMenu
      collection={collection}
      onSave={(details) => {
        refreshCollections(getAffectedCollectionIds(details));
      }}
      customArchiveMessage={
        isLibraryDataCollection && childCount > 0
          ? t`Archiving this collection will also unpublish the tables inside it and archive any other child items.`
          : undefined
      }
      onArchiveSuccess={onArchiveSuccess}
    />
  );
}

const getAffectedCollectionIds = ({
  previousParentId,
  newParentId,
}: {
  previousParentId: CollectionId | null;
  newParentId: CollectionId | null;
}) => _.uniq([previousParentId, newParentId]).filter(_.isNumber);

const getParentCollectionId = (collection: Collection) => {
  const parentId =
    "collection_id" in collection
      ? collection.collection_id
      : collection.parent_id;

  return typeof parentId === "number" ? parentId : null;
};
