import { CollectionRowMenu } from "metabase/common/collections/components/CollectionRowMenu";
import type { CollectionRowModalState } from "metabase/common/collections/components/CollectionRowModal";
import type { Collection } from "metabase-types/api";

import { getArchiveLibraryCollectionsMessage } from "../utils";

type LibraryCollectionRowMenuProps = {
  childCount: number;
  collection: Collection;
  onOpenModal: (modal: CollectionRowModalState) => void;
};

export function LibraryCollectionRowMenu({
  childCount,
  collection,
  onOpenModal,
}: LibraryCollectionRowMenuProps) {
  const isLibraryDataCollection =
    collection.type === "library-data" && !collection.is_library_root;

  return (
    <CollectionRowMenu
      collection={collection}
      onOpenModal={onOpenModal}
      customArchiveMessage={
        isLibraryDataCollection && childCount > 0
          ? getArchiveLibraryCollectionsMessage(1)
          : undefined
      }
    />
  );
}
