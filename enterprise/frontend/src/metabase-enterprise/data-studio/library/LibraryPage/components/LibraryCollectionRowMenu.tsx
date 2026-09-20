import { useDisclosure } from "@mantine/hooks";
import { useCallback } from "react";
import { t } from "ttag";
import _ from "underscore";

import { CollectionRowMenu } from "metabase/common/collections/components/CollectionRowMenu";
import CreateCollectionModal from "metabase/common/collections/containers/CreateCollectionModal";
import type { Collection, CollectionId } from "metabase-types/api";

import { getArchiveLibraryCollectionsMessage } from "../utils";

type LibraryCollectionRowMenuProps = {
  childCount: number;
  collection: Collection;
  refreshCollections: (collectionIds: CollectionId[]) => void;
};

export function LibraryCollectionRowMenu(props: LibraryCollectionRowMenuProps) {
  const { childCount, collection, refreshCollections } = props;
  const [isNewFolderModalOpen, { open: openNewFolder, close: closeNewFolder }] =
    useDisclosure(false);

  const isLibraryDataCollection =
    collection.type === "library-data" && !collection.is_library_root;

  const onArchiveSuccess = useCallback(() => {
    const parentId = getParentCollectionId(collection);

    if (parentId == null) {
      return;
    }

    refreshCollections([parentId]);
  }, [collection, refreshCollections]);

  const onFolderCreated = useCallback(() => {
    closeNewFolder();
    refreshCollections([collection.id]);
  }, [closeNewFolder, collection.id, refreshCollections]);

  return (
    <>
      <CollectionRowMenu
        collection={collection}
        onNewFolder={openNewFolder}
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
      {isNewFolderModalOpen && (
        <CreateCollectionModal
          title={t`New folder`}
          initialCollectionId={collection.id}
          showCollectionPicker={false}
          showAuthorityLevelPicker={false}
          showIconPicker
          onCreate={onFolderCreated}
          onClose={closeNewFolder}
        />
      )}
    </>
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
