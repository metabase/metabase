import { useMemo } from "react";
import { t } from "ttag";
import * as Yup from "yup";

import { hasFeature } from "metabase/admin/databases/utils";
import {
  skipToken,
  useGetDatabaseQuery,
  useListDatabaseSchemasQuery,
} from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSubmitButton,
  FormTextInput,
  FormTextarea,
} from "metabase/forms";
import * as Errors from "metabase/lib/errors";
import { Box, Button, FocusTrap, Group, Modal, Stack } from "metabase/ui";
import { useCreateTransformMutation } from "metabase-enterprise/api";
import { trackTransformCreated } from "metabase-enterprise/transforms/analytics";
import { SchemaFormSelect } from "metabase-enterprise/transforms/components/SchemaFormSelect";
import type {
  CreateTransformRequest,
  DatasetQuery,
  Transform,
} from "metabase-types/api";

const NEW_TRANSFORM_SCHEMA = Yup.object({
  name: Yup.string().required(Errors.required),
  description: Yup.string().nullable(),
  targetName: Yup.string().required(Errors.required),
  targetSchema: Yup.string().nullable(),
});

type NewTransformValues = Yup.InferType<typeof NEW_TRANSFORM_SCHEMA>;

type CreateTransformModalProps = {
  query: DatasetQuery;
  initValues?: Partial<NewTransformValues>;
  onCreate: (transform: Transform) => void;
  onClose: () => void;
};

export function CreateTransformModal({
  query,
  initValues,
  onCreate,
  onClose,
}: CreateTransformModalProps) {
  return (
    <Modal title={t`Save your transform`} opened padding="xl" onClose={onClose}>
      <FocusTrap.InitialFocus />
      <CreateTransformForm
        query={query}
        initValues={initValues}
        onCreate={onCreate}
        onClose={onClose}
      />
    </Modal>
  );
}

type CreateTransformFormProps = {
  query: DatasetQuery;
  initValues?: Partial<NewTransformValues>;
  onCreate: (transform: Transform) => void;
  onClose: () => void;
};

function CreateTransformForm({
  query,
  initValues,
  onCreate,
  onClose,
}: CreateTransformFormProps) {
  const { database: databaseId } = query;

  const {
    data: database,
    isLoading: isDatabaseLoading,
    error: databaseError,
  } = useGetDatabaseQuery(databaseId ? { id: databaseId } : skipToken);

  const {
    data: schemas = [],
    isLoading: isSchemasLoading,
    error: schemasError,
  } = useListDatabaseSchemasQuery(
    databaseId ? { id: databaseId, include_hidden: true } : skipToken,
  );

  const isLoading = isDatabaseLoading || isSchemasLoading;
  const error = databaseError ?? schemasError;

  const [createTransform] = useCreateTransformMutation();
  const supportsSchemas = database && hasFeature(database, "schemas");

  const initialValues: NewTransformValues = useMemo(
    () => getInitialValues(schemas, initValues),
    [schemas, initValues],
  );

  if (isLoading || error != null) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  const handleSubmit = async (values: NewTransformValues) => {
    const request = getCreateRequest(query, values);
    const transform = await createTransform(request).unwrap();

    trackTransformCreated({ transformId: transform.id });

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
          <FormTextarea
            name="description"
            label={t`Description`}
            placeholder={t`This is optional`}
            minRows={4}
            maxRows={10}
          />
          {supportsSchemas && (
            <SchemaFormSelect
              name="targetSchema"
              label={t`Schema`}
              data={schemas}
            />
          )}
          <FormTextInput
            name="targetName"
            label={t`Table name`}
            placeholder={t`some_name`}
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
  schemas: string[],
  initValues?: Partial<NewTransformValues>,
): NewTransformValues {
  return {
    name: "",
    description: null,
    targetName: "",
    targetSchema: schemas?.[0] || null,
    ...initValues,
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
      schema: targetSchema ?? null,
    },
  };
}
