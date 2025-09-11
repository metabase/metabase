import { useCallback } from "react";
import { t } from "ttag";

import Snippets from "metabase/entities/snippets";
import { useDispatch } from "metabase/lib/redux";
import { Flex, Modal } from "metabase/ui";
import type { NativeQuerySnippet } from "metabase-types/api";

import SnippetForm, {
  type SnippetFormValues,
  type UpdateSnippetFormValues,
} from "../SnippetForm";

type SnippetModalProps = {
  snippet:
    | NativeQuerySnippet
    | (Omit<Partial<NativeQuerySnippet>, "id"> & { id: undefined });
  onCreate: (snippet: NativeQuerySnippet) => void;
  onUpdate: (
    nextSnippet: NativeQuerySnippet,
    originalSnippet: NativeQuerySnippet,
  ) => void;
  onClose: () => void;
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
      if (snippet.id == null) {
        return;
      }
      const action = await dispatch(Snippets.actions.update(values));
      const nextSnippet = Snippets.HACK_getObjectFromAction(action);
      onUpdate?.(nextSnippet, snippet);
      onClose?.();
    },
    [snippet, dispatch, onUpdate, onClose],
  );

  const handleArchive = useCallback(async () => {
    await dispatch(Snippets.actions.update({ id: snippet.id, archived: true }));
    onClose?.();
  }, [snippet, dispatch, onClose]);

  return (
    <Modal.Root padding="xl" opened onClose={onClose}>
      <Modal.Overlay />
      <Modal.Content>
        <Modal.Header px="xl">
          <Modal.Title>{title}</Modal.Title>
          <Flex justify="flex-end">
            <Modal.CloseButton />
          </Flex>
        </Modal.Header>
        <Modal.Body px="xl">
          <SnippetForm
            {...props}
            snippet={snippet}
            onCreate={handleCreate}
            onUpdate={handleUpdate}
            onArchive={handleArchive}
            onCancel={onClose}
          />
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default SnippetFormModal;
