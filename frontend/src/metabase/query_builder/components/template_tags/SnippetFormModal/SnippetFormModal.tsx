import { useCallback } from "react";
import { t } from "ttag";

import ModalContent from "metabase/common/components/ModalContent";
import Snippets from "metabase/entities/snippets";
import { useDispatch } from "metabase/lib/redux";
import type { NativeQuerySnippet } from "metabase-types/api";

import SnippetForm, {
  type SnippetFormValues,
  type UpdateSnippetFormValues,
} from "../SnippetForm";

type SnippetModalProps = {
  snippet: Partial<NativeQuerySnippet>;
  onCreate?: (snippet: NativeQuerySnippet) => void;
  onUpdate?: (
    nextSnippet: NativeQuerySnippet,
    originalSnippet: NativeQuerySnippet,
  ) => void;
  onClose?: () => void;
};

function SnippetFormModal({
  snippet,
  onCreate,
  onUpdate,
  onClose,
  ...props
}: SnippetModalProps) {
  const dispatch = useDispatch();
  const isEditing = snippet.id != null;
  const title = isEditing
    ? t`Editing ${snippet.name}`
    : t`Create your new snippet`;

  const handleCreate = useCallback(
    async (values: SnippetFormValues) => {
      const action = await dispatch(Snippets.actions.create(values));
      const snippet = Snippets.HACK_getObjectFromAction(action);
      onCreate?.(snippet);
      onClose?.();
    },
    [dispatch, onCreate, onClose],
  );

  const handleUpdate = useCallback(
    async (values: UpdateSnippetFormValues) => {
      const action = await dispatch(Snippets.actions.update(values));
      const nextSnippet = Snippets.HACK_getObjectFromAction(action);
      onUpdate?.(nextSnippet, snippet as NativeQuerySnippet);
      onClose?.();
    },
    [snippet, dispatch, onUpdate, onClose],
  );

  const handleArchive = useCallback(async () => {
    await dispatch(Snippets.actions.update({ id: snippet.id, archived: true }));
    onClose?.();
  }, [snippet, dispatch, onClose]);

  return (
    <ModalContent title={title} onClose={onClose}>
      <SnippetForm
        {...props}
        snippet={snippet}
        onCreate={handleCreate}
        onUpdate={handleUpdate}
        onArchive={handleArchive}
        onCancel={onClose}
      />
    </ModalContent>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default SnippetFormModal;
