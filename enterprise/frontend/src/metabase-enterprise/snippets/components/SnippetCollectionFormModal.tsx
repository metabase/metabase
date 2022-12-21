import React, { useCallback } from "react";
import { t } from "ttag";

import ModalContent from "metabase/components/ModalContent";

import type { Collection } from "metabase-types/api";

import SnippetCollectionForm, {
  SnippetCollectionFormOwnProps,
} from "./SnippetCollectionForm";

interface SnippetCollectionFormModalOwnProps
  extends Omit<SnippetCollectionFormOwnProps, "onCancel"> {
  onClose?: () => void;
}

type SnippetCollectionFormModalProps = SnippetCollectionFormModalOwnProps;

function SnippetFormModal({
  collection,
  onSave,
  onClose,
  ...props
}: SnippetCollectionFormModalProps) {
  const isEditing = collection.id != null;
  const title = isEditing
    ? t`Editing ${collection.name}`
    : t`Create your new folder`;

  const handleSave = useCallback(
    (snippetCollection: Collection) => {
      onSave?.(snippetCollection);
      onClose?.();
    },
    [onSave, onClose],
  );

  return (
    <ModalContent title={title} onClose={onClose}>
      <SnippetCollectionForm
        {...props}
        collection={collection}
        onSave={handleSave}
        onCancel={onClose}
      />
    </ModalContent>
  );
}

export default SnippetFormModal;
