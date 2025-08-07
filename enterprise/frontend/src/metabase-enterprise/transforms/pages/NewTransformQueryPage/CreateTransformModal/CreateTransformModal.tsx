import { useMemo } from "react";
import { t } from "ttag";
import * as Yup from "yup";

import { skipToken, useListDatabaseSchemasQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSelect,
  FormSubmitButton,
  FormTextInput,
} from "metabase/forms";
import * as Errors from "metabase/lib/errors";
import { Button, Group, Modal, Stack } from "metabase/ui";
import { useCreateTransformMutation } from "metabase-enterprise/api";
import type {
  CreateTransformRequest,
  DatasetQuery,
  Transform,
} from "metabase-types/api";

type CreateTransformModalProps = {
  query: DatasetQuery;
  onCreate: (transform: Transform) => void;
  onClose: () => void;
};

export function CreateTransformModal({
  query,
  onCreate,
  onClose,
}: CreateTransformModalProps) {
  return (
    <Modal title={t`Save your transform`} opened padding="xl" onClose={onClose}>
      <CreateTransformForm
        query={query}
        onCreate={onCreate}
        onClose={onClose}
      />
    </Modal>
  );
}

type CreateTransformFormProps = {
  query: DatasetQuery;
  onCreate: (transform: Transform) => void;
  onClose: () => void;
};

type NewTransformValues = {
  name: string;
  description: string | null;
  targetName: string;
  targetSchema: string | null;
};

const NEW_TRANSFORM_SCHEMA = Yup.object({
  name: Yup.string().required(Errors.required),
  description: Yup.string().nullable(),
  targetName: Yup.string().required(Errors.required),
  targetSchema: Yup.string().nullable(),
});

function CreateTransformForm({
  query,
  onCreate,
  onClose,
}: CreateTransformFormProps) {
  const { database: databaseId } = query;
  const {
    data: schemas = [],
    isLoading,
    error,
  } = useListDatabaseSchemasQuery(
    databaseId ? { id: databaseId, include_hidden: true } : skipToken,
  );
  const [createTransform] = useCreateTransformMutation();

  const initialValues: NewTransformValues = useMemo(
    () => getInitialValues(schemas),
    [schemas],
  );

  if (isLoading || error != null) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  const handleSubmit = async (values: NewTransformValues) => {
    const request = getCreateRequest(query, values);
    const transform = await createTransform(request).unwrap();
    onCreate(transform);
  };

  return (
    <FormProvider
      initialValues={initialValues}
      validationSchema={NEW_TRANSFORM_SCHEMA}
      onSubmit={handleSubmit}
    >
      <Form>
        <Stack gap="lg">
          <FormTextInput
            name="name"
            label={t`Name`}
            placeholder={t`My Great Transform`}
          />
          <FormTextInput
            name="description"
            label={t`Description`}
            placeholder={t`This is optional`}
          />
          {schemas.length > 1 && (
            <FormSelect name="schema" label={t`Schema`} data={schemas} />
          )}
          <FormTextInput
            name="targetName"
            label={t`Table name`}
            placeholder={t`some_name`}
          />
          <FormErrorMessage />
          <Group justify="end">
            <Button variant="subtle" onClick={onClose}>{t`Back`}</Button>
            <FormSubmitButton label={t`Save`} variant="filled" />
          </Group>
        </Stack>
      </Form>
    </FormProvider>
  );
}

function getInitialValues(schemas: string[]): NewTransformValues {
  return {
    name: "",
    description: null,
    targetName: "",
    targetSchema: schemas ? schemas[0] : null,
  };
}

function getCreateRequest(
  query: DatasetQuery,
  { name, description, targetName, targetSchema }: NewTransformValues,
): CreateTransformRequest {
  return {
    name: name,
    description,
    source: {
      type: "query",
      query,
    },
    target: {
      type: "table",
      name: targetName,
      schema: targetSchema,
    },
  };
}
