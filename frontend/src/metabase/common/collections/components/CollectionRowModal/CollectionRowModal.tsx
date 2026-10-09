import { match } from "ts-pattern";
import { t } from "ttag";

import { useUpdateCollectionMutation } from "metabase/api";
import { useInvalidateCollectionItems } from "metabase/common/collections/hooks";
import { ConfirmModal } from "metabase/common/components/ConfirmModal";
import { useMetadataToasts } from "metabase/common/hooks";
import { PLUGIN_LIBRARY, PLUGIN_SNIPPET_FOLDERS } from "metabase/plugins";
import type { Collection } from "metabase-types/api";

import { EditCollectionModal } from "./EditCollectionModal";

export type EditCollectionModalState = {
  type: "edit";
  collection: Collection;
};

export type CollectionPermissionsModalState = {
  type: "permissions";
  collection: Collection;
};

export type ArchiveCollectionModalState = {
  type: "archive";
  collection: Collection;
  customArchiveMessage?: string;
};

export type CollectionRowModalState =
  | EditCollectionModalState
  | CollectionPermissionsModalState
  | ArchiveCollectionModalState;

type CollectionRowModalProps = {
  modal: CollectionRowModalState | undefined;
  onClose: () => void;
};

export function CollectionRowModal({
  modal,
  onClose,
}: CollectionRowModalProps) {
  if (modal == null) {
    return null;
  }

  return match(modal)
    .with({ type: "edit" }, ({ collection }) => (
      <EditCollectionModal collection={collection} onClose={onClose} />
    ))
    .with({ type: "permissions" }, ({ collection }) => (
      <PermissionsModal collection={collection} onClose={onClose} />
    ))
    .with({ type: "archive" }, ({ collection, customArchiveMessage }) => (
      <ArchiveCollectionModal
        collection={collection}
        customArchiveMessage={customArchiveMessage}
        onClose={onClose}
      />
    ))
    .exhaustive();
}

type PermissionsModalProps = {
  collection: Collection;
  onClose: () => void;
};

function PermissionsModal({ collection, onClose }: PermissionsModalProps) {
  if (collection.namespace === "snippets") {
    return (
      <PLUGIN_SNIPPET_FOLDERS.CollectionPermissionsModal
        opened
        collectionId={collection.id}
        onClose={onClose}
      />
    );
  }

  return (
    <PLUGIN_LIBRARY.CollectionPermissionsModal
      opened
      collectionId={collection.id}
      namespace={collection.namespace}
      onClose={onClose}
    />
  );
}

type ArchiveCollectionModalProps = {
  collection: Collection;
  customArchiveMessage?: string;
  onClose: () => void;
};

function ArchiveCollectionModal({
  collection,
  customArchiveMessage,
  onClose,
}: ArchiveCollectionModalProps) {
  const [updateCollection] = useUpdateCollectionMutation();
  const invalidateCollectionItems = useInvalidateCollectionItems();
  const { sendSuccessToast, sendErrorToast } = useMetadataToasts();

  const handleArchive = async () => {
    onClose();
    try {
      await updateCollection({ id: collection.id, archived: true }).unwrap();
      sendSuccessToast(t`"${collection.name}" has been archived`);
      invalidateCollectionItems(collection);
    } catch {
      sendErrorToast(t`"${collection.name}" could not be archived`);
    }
  };

  return (
    <ConfirmModal
      opened
      data-testid="confirm-modal"
      title={t`Archive "${collection.name}"?`}
      message={customArchiveMessage}
      confirmButtonText={t`Archive`}
      onConfirm={handleArchive}
      onClose={onClose}
    />
  );
}
