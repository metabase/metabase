import { useCallback, useMemo } from "react";
import { t } from "ttag";

import {
  useGetCollectionQuery,
  useUpdateCollectionMutation,
} from "metabase/api";
import { getErrorMessage } from "metabase/api/utils";
import FormCollectionPicker from "metabase/collections/containers/FormCollectionPicker";
import {
  COLLECTION_FORM_SCHEMA,
  type CollectionFormValues,
} from "metabase/collections/schemas";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import type { OmniPickerItem } from "metabase/common/components/Pickers";
import { isItemInCollectionOrItsDescendants } from "metabase/common/components/Pickers/utils";
import { useToast } from "metabase/common/hooks";
import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSubmitButton,
  FormTextInput,
  FormTextarea,
} from "metabase/forms";
import { Button, Group, Modal, Stack } from "metabase/ui";

type EditTransformCollectionModalProps = {
  collectionId: number;
  onClose: () => void;
  onSave?: () => void;
};

export function EditTransformCollectionModal({
  collectionId,
  onClose,
  onSave,
}: EditTransformCollectionModalProps) {
  const [sendToast] = useToast();
  const [updateCollection] = useUpdateCollectionMutation();

  const {
    data: collection,
    isLoading,
    error,
  } = useGetCollectionQuery({
    id: collectionId,
    namespace: "transforms",
  });

  const initialValues = useMemo<CollectionFormValues>(() => {
    if (!collection) {
      return COLLECTION_FORM_SCHEMA.getDefault();
    }
    const parentId = collection.parent_id;
    return {
      name: collection.name ?? "",
      description: collection.description ?? null,
      parent_id: typeof parentId === "number" ? parentId : null,
    };
  }, [collection]);

  const handleSubmit = useCallback(
    async (values: CollectionFormValues) => {
      try {
        await updateCollection({
          id: collectionId,
          name: values.name,
          description: values.description ?? undefined,
          parent_id: values.parent_id,
        }).unwrap();
        onSave?.();
        onClose();
      } catch (err) {
        sendToast({
          message: getErrorMessage(err, t`Failed to update collection`),
          icon: "warning",
        });
      }
    },
    [collectionId, updateCollection, onSave, onClose, sendToast],
  );

  const shouldDisableItem = useCallback(
    (item: OmniPickerItem) =>
      isItemInCollectionOrItsDescendants(item, collectionId),
    [collectionId],
  );

  const stopPropagation = useCallback(
    (e: React.KeyboardEvent) => e.stopPropagation(),
    [],
  );

  if (isLoading || error) {
    return (
      <Modal
        title={t`Edit collection`}
        opened
        onClose={onClose}
        padding="xl"
        onKeyDown={stopPropagation}
      >
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Modal>
    );
  }

  return (
    <Modal
      title={t`Editing ${collection?.name}`}
      opened
      onClose={onClose}
      padding="xl"
      onKeyDown={stopPropagation}
    >
      <FormProvider
        initialValues={initialValues}
        validationSchema={COLLECTION_FORM_SCHEMA}
        onSubmit={handleSubmit}
        enableReinitialize
      >
        {({ dirty }) => (
          <Form>
            <Stack gap="lg" mt="sm">
              <FormTextInput
                name="name"
                label={t`Name`}
                placeholder={t`My collection`}
                data-autofocus
              />
              <FormTextarea
                name="description"
                label={t`Description`}
                placeholder={t`Add a description`}
                nullable
              />
              <FormCollectionPicker
                name="parent_id"
                title={t`Parent collection`}
                collectionPickerModalProps={{
                  isDisabledItem: shouldDisableItem,
                  namespaces: ["transforms"],
                }}
              />
              <Group justify="flex-end">
                <FormErrorMessage />
                <Button onClick={onClose}>{t`Cancel`}</Button>
                <FormSubmitButton
                  label={t`Save`}
                  variant="filled"
                  disabled={!dirty}
                />
              </Group>
            </Stack>
          </Form>
        )}
      </FormProvider>
    </Modal>
  );
}
