import { useMemo } from "react";
import { t } from "ttag";
import * as Yup from "yup";

import { useCreateCardMutation } from "metabase/api";
import FormCollectionPicker from "metabase/collections/containers/FormCollectionPicker";
import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSubmitButton,
  FormTextInput,
  FormTextarea,
} from "metabase/forms";
import * as Errors from "metabase/lib/errors";
import { Box, Button, Group, Modal, Stack } from "metabase/ui";
import * as Lib from "metabase-lib";
import type { Card, CreateCardRequest } from "metabase-types/api";

import type { NewModelValues } from "../types";

const NEW_MODEL_SCHEMA = Yup.object({
  name: Yup.string().required(Errors.required),
  description: Yup.string().nullable(),
  collection_id: Yup.number().nullable().default(null),
});

type CreateModelModalProps = {
  query: Lib.Query;
  defaultValues: Partial<NewModelValues>;
  onCreate: (card: Card) => void;
  onClose: () => void;
};

export function CreateModelModal({
  query,
  defaultValues,
  onCreate,
  onClose,
}: CreateModelModalProps) {
  return (
    <Modal title={t`Save your model`} opened padding="xl" onClose={onClose}>
      <CreateModelForm
        query={query}
        defaultValues={defaultValues}
        onCreate={onCreate}
        onClose={onClose}
      />
    </Modal>
  );
}

type CreateModelFormProps = {
  query: Lib.Query;
  defaultValues: Partial<NewModelValues>;
  onCreate: (card: Card) => void;
  onClose: () => void;
};

function CreateModelForm({
  query,
  defaultValues,
  onCreate,
  onClose,
}: CreateModelFormProps) {
  const [createCard] = useCreateCardMutation();

  const initialValues: NewModelValues = useMemo(
    () => getInitialValues(defaultValues),
    [defaultValues],
  );

  const handleSubmit = async (values: NewModelValues) => {
    const request = getCreateRequest(query, values);
    const card = await createCard(request).unwrap();
    onCreate(card);
  };

  return (
    <FormProvider
      initialValues={initialValues}
      validationSchema={NEW_MODEL_SCHEMA}
      onSubmit={handleSubmit}
    >
      <Form>
        <Stack gap="lg">
          <FormTextInput
            name="name"
            label={t`Name`}
            placeholder={t`My Great Model`}
            data-autofocus
          />
          <FormTextarea
            name="description"
            label={t`Description`}
            placeholder={t`This is optional, but helpful`}
            minRows={4}
            maxRows={10}
          />
          <FormCollectionPicker
            name="collection_id"
            title={t`Where do you want to save this?`}
            entityType="dataset"
          />
          <Group>
            <Box flex={1}>
              <FormErrorMessage />
            </Box>
            <Button variant="subtle" onClick={onClose}>{t`Back`}</Button>
            <FormSubmitButton label={t`Save`} variant="filled" />
          </Group>
        </Stack>
      </Form>
    </FormProvider>
  );
}

function getInitialValues(
  defaultValues: Partial<NewModelValues>,
): NewModelValues {
  return {
    name: "",
    description: null,
    result_metadata: null,
    resultMetadata: null,
    collection_id: null,
    ...defaultValues,
  };
}

function getCreateRequest(
  query: Lib.Query,
  { name, description, collection_id, result_metadata }: NewModelValues,
): CreateCardRequest {
  return {
    name,
    description,
    collection_id,
    result_metadata,
    type: "model",
    dataset_query: Lib.toJsQuery(query),
    display: "table",
    visualization_settings: {},
  };
}
