import { t } from "ttag";

import { Modal } from "metabase/ui";
import type { Collection } from "metabase-types/api";

import SnippetCollectionForm from "./SnippetCollectionForm";

interface SnippetCollectionFormModalProps {
  collection: Partial<Collection>;
  onClose: () => void;
  onSaved?: () => void;
}

function SnippetFormModal({
  collection,
  onSaved,
  onClose,
}: SnippetCollectionFormModalProps) {
  const isEditing = collection.id != null;
  const title = isEditing
    ? t`Editing ${collection.name}`
    : t`Create your new folder`;

  const handleSave = () => {
    onSaved?.();
    onClose();
  };

  return (
    <Modal opened onClose={onClose} title={title}>
      <SnippetCollectionForm
        collection={collection}
        onSave={handleSave}
        onCancel={onClose}
      />
    </Modal>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default SnippetFormModal;
