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

import type { NewMetricValues } from "../types";

const NEW_METRIC_SCHEMA = Yup.object({
  name: Yup.string().required(Errors.required),
  description: Yup.string().nullable(),
  collection_id: Yup.number().nullable().default(null),
});

type CreateMetricModalProps = {
  query: Lib.Query;
  defaultValues: Partial<NewMetricValues>;
  onCreate: (card: Card) => void;
  onClose: () => void;
};

export function CreateMetricModal({
  query,
  defaultValues,
  onCreate,
  onClose,
}: CreateMetricModalProps) {
  return (
    <Modal title={t`Save your metric`} opened padding="xl" onClose={onClose}>
      <CreateMetricForm
        query={query}
        defaultValues={defaultValues}
        onCreate={onCreate}
        onClose={onClose}
      />
    </Modal>
  );
}

type CreateMetricFormProps = {
  query: Lib.Query;
  defaultValues: Partial<NewMetricValues>;
  onCreate: (card: Card) => void;
  onClose: () => void;
};

function CreateMetricForm({
  query,
  defaultValues,
  onCreate,
  onClose,
}: CreateMetricFormProps) {
  const [createCard] = useCreateCardMutation();

  const initialValues: NewMetricValues = useMemo(
    () => getInitialValues(defaultValues),
    [defaultValues],
  );

  const handleSubmit = async (values: NewMetricValues) => {
    const request = getCreateRequest(query, values);
    const card = await createCard(request).unwrap();
    onCreate(card);
  };

  return (
    <FormProvider
      initialValues={initialValues}
      validationSchema={NEW_METRIC_SCHEMA}
      onSubmit={handleSubmit}
    >
      <Form>
        <Stack gap="lg">
          <FormTextInput
            name="name"
            label={t`Name`}
            placeholder={t`My Great Metric`}
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
            entityType="metric"
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
  defaultValues: Partial<NewMetricValues>,
): NewMetricValues {
  return {
    name: "",
    description: null,
    collection_id: null,
    result_metadata: null,
    resultMetadata: null,
    ...defaultValues,
  };
}

function getCreateRequest(
  query: Lib.Query,
  { name, description, collection_id, result_metadata }: NewMetricValues,
): CreateCardRequest {
  const { display, settings = {} } = Lib.defaultDisplay(query);
  return {
    name,
    description,
    collection_id,
    result_metadata,
    type: "metric",
    dataset_query: Lib.toJsQuery(query),
    display,
    visualization_settings: settings,
  };
}
