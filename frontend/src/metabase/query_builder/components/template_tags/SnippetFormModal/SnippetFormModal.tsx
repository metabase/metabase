import { useCallback, useState } from "react";
import { t } from "ttag";

import { Snippets } from "metabase/entities/snippets";
import { useDispatch } from "metabase/lib/redux";
import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import { Flex, Modal } from "metabase/ui";
import type {
  CreateSnippetRequest,
  NativeQuerySnippet,
  UpdateSnippetRequest,
} from "metabase-types/api";

import { SnippetForm, type SnippetFormValues } from "../SnippetForm";

type SnippetModalProps = {
  snippet: NativeQuerySnippet | Partial<Omit<NativeQuerySnippet, "id">>;
  onCreate: (snippet: NativeQuerySnippet) => void;
  onUpdate: (
    nextSnippet: NativeQuerySnippet,
    originalSnippet: NativeQuerySnippet,
  ) => void;
  onClose: () => void;
};

export function SnippetFormModal({
  snippet: initialSnippet,
  onCreate,
  onUpdate,
  onClose,
}: SnippetModalProps) {
  const [snippet, setSnippet] = useState(initialSnippet);
  const dispatch = useDispatch();
  const isEditing = isSavedSnippet(snippet);
  const modalTitle = isEditing
    ? t`Editing ${snippet.name}`
    : t`Create your new snippet`;

  const handleCreate = useCallback(
    async (values: CreateSnippetRequest) => {
      const action = await dispatch(Snippets.actions.create(values));
      const snippet = Snippets.HACK_getObjectFromAction(action);
      onCreate?.(snippet);
      onClose?.();
    },
    [dispatch, onCreate, onClose],
  );

  const handleUpdate = useCallback(
    async (values: UpdateSnippetRequest) => {
      if (!isSavedSnippet(snippet)) {
        return;
      }
      const action = await dispatch(Snippets.actions.update(snippet, values));
      const nextSnippet = Snippets.HACK_getObjectFromAction(action);
      onUpdate?.(nextSnippet, snippet);
      onClose?.();
    },
    [snippet, dispatch, onUpdate, onClose],
  );

  const handleArchive = useCallback(async () => {
    if (!isSavedSnippet(snippet)) {
      return;
    }
    await dispatch(Snippets.actions.update({ id: snippet.id, archived: true }));
    onClose?.();
  }, [snippet, dispatch, onClose]);

  const {
    checkData,
    isConfirmationShown,
    handleInitialSave,
    handleSaveAfterConfirmation,
    handleCloseConfirmation,
  } = PLUGIN_DEPENDENCIES.useCheckSnippetDependencies({
    onSave: handleUpdate,
  });

  const handleSubmit = useCallback(
    async (values: SnippetFormValues) => {
      if (isSavedSnippet(snippet)) {
        setSnippet({ ...snippet, ...values });
        await handleInitialSave({ ...values, id: snippet.id });
      } else {
        await handleCreate(values);
      }
    },
    [snippet, handleCreate, handleInitialSave],
  );

  return (
    <Modal.Root padding="xl" opened onClose={onClose}>
      <Modal.Overlay />
      <Modal.Content>
        <Modal.Header px="xl">
          <Modal.Title>
            {isConfirmationShown ? (
              <PLUGIN_DEPENDENCIES.CheckDependenciesTitle />
            ) : (
              modalTitle
            )}
          </Modal.Title>
          <Flex justify="flex-end">
            <Modal.CloseButton />
          </Flex>
        </Modal.Header>
        <Modal.Body px={isConfirmationShown ? 0 : "xl"}>
          {isConfirmationShown && checkData != null ? (
            <PLUGIN_DEPENDENCIES.CheckDependenciesForm
              checkData={checkData}
              onSave={handleSaveAfterConfirmation}
              onCancel={handleCloseConfirmation}
            />
          ) : (
            <SnippetForm
              snippet={snippet}
              isEditing={isEditing}
              isDirty={checkData != null}
              onSubmit={handleSubmit}
              onArchive={handleArchive}
              onCancel={onClose}
            />
          )}
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
}

function isSavedSnippet(
  snippet: NativeQuerySnippet | Partial<Omit<NativeQuerySnippet, "id">>,
): snippet is NativeQuerySnippet {
  return "id" in snippet;
}
