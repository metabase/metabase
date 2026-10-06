import { useCallback, useMemo } from "react";
import { t } from "ttag";

import { useCreateCollectionMutation } from "metabase/api";
import { getErrorMessage } from "metabase/api/utils";
import FormCollectionPicker from "metabase/common/collections/containers/FormCollectionPicker";
import {
  COLLECTION_FORM_SCHEMA,
  type CollectionFormValues,
} from "metabase/common/collections/schemas";
import { useToast } from "metabase/common/hooks";
import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSubmitButton,
  FormTextInput,
  FormTextarea,
} from "metabase/forms";
import { Button, Modal, Stack } from "metabase/ui";
import type { Collection } from "metabase-types/api";

type CreateTransformCollectionModalProps = {
  onClose: () => void;
  onCreate?: (collection: Collection) => void;
};

export function CreateTransformCollectionModal({
  onClose,
  onCreate,
}: CreateTransformCollectionModalProps) {
  const [sendToast] = useToast();
  const [createCollection] = useCreateCollectionMutation();

  const initialValues = useMemo<CollectionFormValues>(
    () => COLLECTION_FORM_SCHEMA.getDefault(),
    [],
  );

  const handleSubmit = useCallback(
    async (values: CollectionFormValues) => {
      try {
        const collection = await createCollection({
          name: values.name,
          description: values.description ?? undefined,
          parent_id: values.parent_id,
          namespace: "transforms",
        }).unwrap();
        onCreate?.(collection);
        onClose();
      } catch (error) {
        sendToast({
          message: getErrorMessage(error, t`Failed to create collection`),
          icon: "warning",
        });
      }
    },
    [createCollection, onCreate, onClose, sendToast],
  );

  const stopPropagation = useCallback(
    (e: React.KeyboardEvent) => e.stopPropagation(),
    [],
  );

  return (
    <Modal
      density="relaxed"
      title={t`Transform folder`}
      opened
      onClose={onClose}
      onKeyDown={stopPropagation}
    >
      <FormProvider
        initialValues={initialValues}
        validationSchema={COLLECTION_FORM_SCHEMA}
        onSubmit={handleSubmit}
      >
        <Form>
          <Stack gap="xl">
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
              collectionPickerModalProps={{ namespaces: ["transforms"] }}
            />
          </Stack>
          <Modal.Footer>
            <FormErrorMessage flex={1} />
            <Button variant="subtle" color="neutral" onClick={onClose}>
              {t`Cancel`}
            </Button>
            <FormSubmitButton label={t`Create`} variant="filled" />
          </Modal.Footer>
        </Form>
      </FormProvider>
    </Modal>
  );
}
