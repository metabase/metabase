import { useCallback } from "react";
import _ from "underscore";

import { CollectionRowMenu } from "metabase/common/collections/components/CollectionRowMenu";
import { getArchiveLibraryCollectionsMessage } from "metabase/data-studio/common/utils";
import type { Collection, CollectionId } from "metabase-types/api";

type LibraryCollectionRowMenuProps = {
  childCount: number;
  collection: Collection;
  refreshCollections: (collectionIds: CollectionId[]) => void;
};

export function LibraryCollectionRowMenu(props: LibraryCollectionRowMenuProps) {
  const { childCount, collection, refreshCollections } = props;
  const isLibraryDataCollection =
    collection.type === "library-data" && !collection.is_library_root;

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
          ? getArchiveLibraryCollectionsMessage(1)
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
