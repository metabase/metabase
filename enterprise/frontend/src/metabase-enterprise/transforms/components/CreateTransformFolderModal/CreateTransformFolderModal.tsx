import { useCallback, useMemo } from "react";
import { t } from "ttag";
import * as Yup from "yup";

import { useCreateCollectionMutation } from "metabase/api";
import { getErrorMessage } from "metabase/api/utils";
import FormCollectionPicker from "metabase/collections/containers/FormCollectionPicker";
import { useToast } from "metabase/common/hooks";
import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSubmitButton,
  FormTextInput,
} from "metabase/forms";
import * as Errors from "metabase/lib/errors";
import { Button, Group, Modal, Stack } from "metabase/ui";
import type { Collection } from "metabase-types/api";

const COLLECTION_SCHEMA = Yup.object({
  name: Yup.string()
    .required(Errors.required)
    .max(100, Errors.maxLength)
    .default(""),
  parent_id: Yup.number().nullable().default(null),
});

type CollectionFormValues = Yup.InferType<typeof COLLECTION_SCHEMA>;

type CreateTransformFolderModalProps = {
  onClose: () => void;
  onCreate?: (collection: Collection) => void;
};

export function CreateTransformFolderModal({
  onClose,
  onCreate,
}: CreateTransformFolderModalProps) {
  const [sendToast] = useToast();
  const [createCollection] = useCreateCollectionMutation();

  const initialValues = useMemo<CollectionFormValues>(
    () => COLLECTION_SCHEMA.getDefault(),
    [],
  );

  const handleSubmit = useCallback(
    async (values: CollectionFormValues) => {
      try {
        const collection = await createCollection({
          name: values.name,
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

  return (
    <Modal title={t`New collection`} opened onClose={onClose} padding="xl">
      <FormProvider
        initialValues={initialValues}
        validationSchema={COLLECTION_SCHEMA}
        onSubmit={handleSubmit}
      >
        <Form>
          <Stack gap="lg" mt="sm">
            <FormTextInput
              name="name"
              label={t`Name`}
              placeholder={t`My collection`}
              data-autofocus
            />
            <FormCollectionPicker
              name="parent_id"
              title={t`Parent collection`}
              type="transform-collections"
            />
            <Group justify="flex-end">
              <FormErrorMessage />
              <Button variant="subtle" onClick={onClose}>
                {t`Cancel`}
              </Button>
              <FormSubmitButton label={t`Create`} variant="filled" />
            </Group>
          </Stack>
        </Form>
      </FormProvider>
    </Modal>
  );
}
