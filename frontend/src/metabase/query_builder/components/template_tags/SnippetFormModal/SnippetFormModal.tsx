import { useCallback } from "react";
import { t } from "ttag";

import ModalContent from "metabase/components/ModalContent";
import type { NativeQuerySnippet } from "metabase-types/api";

import type { SnippetFormOwnProps } from "../SnippetForm";
import SnippetForm from "../SnippetForm";

interface SnippetFormModalOwnProps
  extends Omit<SnippetFormOwnProps, "onCancel"> {
  onClose?: () => void;
}

type SnippetModalProps = SnippetFormModalOwnProps;

function SnippetFormModal({
  snippet,
  onCreate,
  onUpdate,
  onClose,
  ...props
}: SnippetModalProps) {
  const isEditing = snippet.id != null;
  const title = isEditing
    ? t`Editing ${snippet.name}`
    : t`Create your new snippet`;

  const handleCreate = useCallback(
    (snippet: NativeQuerySnippet) => {
      onCreate?.(snippet);
      onClose?.();
    },
    [onCreate, onClose],
  );

  const handleUpdate = useCallback(
    (nextSnippet: NativeQuerySnippet, originalSnippet: NativeQuerySnippet) => {
      onUpdate?.(nextSnippet, originalSnippet);
      onClose?.();
    },
    [onUpdate, onClose],
  );

  return (
    <ModalContent title={title} onClose={onClose}>
      <SnippetForm
        {...props}
        snippet={snippet}
        onCreate={handleCreate}
        onUpdate={handleUpdate}
        onArchive={onClose}
        onCancel={onClose}
      />
    </ModalContent>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default SnippetFormModal;
