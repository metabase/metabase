import { match } from "ts-pattern";
import { t } from "ttag";

import { useUpdateCollectionMutation } from "metabase/api";
import { useInvalidateCollectionItems } from "metabase/common/collections/hooks";
import { ConfirmModal } from "metabase/common/components/ConfirmModal";
import { useMetadataToasts } from "metabase/common/hooks";
import { PLUGIN_LIBRARY, PLUGIN_SNIPPET_FOLDERS } from "metabase/plugins";
import type { Collection, CollectionId } from "metabase-types/api";

import { EditCollectionModal } from "./EditCollectionModal";

export type CollectionRowModalState =
  | {
      type: "edit";
      collection: Collection;
      onSave?: (details: {
        previousParentId: CollectionId | null;
        newParentId: CollectionId | null;
      }) => void;
    }
  | { type: "permissions"; collection: Collection }
  | {
      type: "archive";
      collection: Collection;
      customArchiveMessage?: string;
      onArchiveSuccess?: () => void;
    };

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
    .with({ type: "edit" }, ({ collection, onSave }) => (
      <EditCollectionModal
        collection={collection}
        onSave={onSave}
        onClose={onClose}
      />
    ))
    .with({ type: "permissions" }, ({ collection }) => (
      <PermissionsModal collection={collection} onClose={onClose} />
    ))
    .with({ type: "archive" }, (archiveModal) => (
      <ArchiveCollectionModal modal={archiveModal} onClose={onClose} />
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
  modal: Extract<CollectionRowModalState, { type: "archive" }>;
  onClose: () => void;
};

function ArchiveCollectionModal({
  modal: { collection, customArchiveMessage, onArchiveSuccess },
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
      onArchiveSuccess?.();
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
