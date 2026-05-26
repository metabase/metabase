import { useCallback, useState } from "react";
import { t } from "ttag";

import {
  useCreateSnippetMutation,
  useUpdateSnippetMutation,
} from "metabase/api";
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
  const [createSnippet] = useCreateSnippetMutation();
  const [updateSnippet] = useUpdateSnippetMutation();
  const isEditing = isSavedSnippet(snippet);
  const modalTitle = isEditing
    ? t`Editing ${snippet.name}`
    : t`Create your new snippet`;

  const handleCreate = useCallback(
    async (values: CreateSnippetRequest) => {
      const created = await createSnippet(values).unwrap();
      onCreate?.(created);
      onClose?.();
    },
    [createSnippet, onCreate, onClose],
  );

  const handleUpdate = useCallback(
    async (values: UpdateSnippetRequest) => {
      if (!isSavedSnippet(snippet)) {
        return;
      }
      const nextSnippet = await updateSnippet({
        ...values,
        id: snippet.id,
      }).unwrap();
      onUpdate?.(nextSnippet, snippet);
      onClose?.();
    },
    [snippet, updateSnippet, onUpdate, onClose],
  );

  const handleArchive = useCallback(async () => {
    if (!isSavedSnippet(snippet)) {
      return;
    }
    await updateSnippet({ id: snippet.id, archived: true });
    onClose?.();
  }, [snippet, updateSnippet, onClose]);

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
