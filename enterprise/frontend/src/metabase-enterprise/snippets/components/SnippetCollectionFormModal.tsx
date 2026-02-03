import { t } from "ttag";

import type { SnippetFormModalProps } from "metabase/plugins";
import { Modal } from "metabase/ui";

import SnippetCollectionForm from "./SnippetCollectionForm";

function SnippetFormModal({
  collection,
  onSaved,
  onClose,
  opened = true,
}: SnippetFormModalProps) {
  const isEditing = collection.id != null;
  const title = isEditing
    ? t`Editing ${collection.name}`
    : t`Create your new folder`;

  const handleSave = () => {
    onSaved?.();
    onClose();
  };

  return (
    <Modal opened={opened} onClose={onClose} title={title}>
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
