import { t } from "ttag";

import { hasFeature } from "metabase/admin/databases/utils";
import {
  skipToken,
  useGetDatabaseQuery,
  useListDatabaseSchemasQuery,
} from "metabase/api";
import FormCollectionPicker from "metabase/collections/containers/FormCollectionPicker";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSubmitButton,
  FormTextInput,
} from "metabase/forms";
import { Box, Button, Group, Modal, Stack } from "metabase/ui";
import { IncrementalTransformSettings } from "metabase-enterprise/transforms/components/IncrementalTransform/IncrementalTransformSettings";
import type { Transform, TransformSource } from "metabase-types/api";

import { SchemaFormSelect } from "../../../components/SchemaFormSelect";

import { TargetNameInput } from "./TargetNameInput";
import type { NewTransformValues } from "./form";
import { useCreateTransform } from "./hooks";

type CreateTransformModalProps = {
  source: TransformSource;
  defaultValues: Partial<NewTransformValues>;
  onCreate: (transform: Transform) => void;
  onClose: () => void;
};

export function CreateTransformModal({
  source,
  defaultValues,
  onCreate,
  onClose,
}: CreateTransformModalProps) {
  return (
    <Modal title={t`Save your transform`} opened padding="xl" onClose={onClose}>
      <CreateTransformForm
        source={source}
        defaultValues={defaultValues}
        onCreate={onCreate}
        onClose={onClose}
      />
    </Modal>
  );
}

type CreateTransformFormProps = {
  source: TransformSource;
  defaultValues: Partial<NewTransformValues>;
  onCreate: (transform: Transform) => void;
  onClose: () => void;
};

function CreateTransformForm({
  source,
  defaultValues,
  onCreate,
  onClose,
}: CreateTransformFormProps) {
  const databaseId =
    source.type === "query" ? source.query.database : source["source-database"];

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

  const supportsSchemas = database && hasFeature(database, "schemas");

  const { initialValues, validationSchema, createTransform } =
    useCreateTransform(schemas, defaultValues);

  if (isLoading || error != null) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  const handleSubmit = async (values: NewTransformValues) => {
    if (!databaseId) {
      throw new Error("Database ID is required");
    }
    const transform = await createTransform(databaseId, source, values);
    onCreate(transform);
  };

  return (
    <FormProvider
      initialValues={initialValues}
      validationSchema={validationSchema}
      onSubmit={handleSubmit}
    >
      <Form>
        <Stack gap="lg" mt="sm">
          <FormTextInput
            name="name"
            label={t`Name`}
            placeholder={t`My Great Transform`}
            data-autofocus
          />
          {supportsSchemas && (
            <SchemaFormSelect
              name="targetSchema"
              label={t`Schema`}
              data={schemas}
            />
          )}
          <TargetNameInput />
          <FormCollectionPicker
            name="collection_id"
            title={t`Collection`}
            type="transform-collections"
            style={{ marginBottom: 0 }}
          />
          <IncrementalTransformSettings source={source} />
          <Group>
            <Box flex={1}>
              <FormErrorMessage />
            </Box>
            <Button onClick={onClose}>{t`Back`}</Button>
            <FormSubmitButton label={t`Save`} variant="filled" />
          </Group>
        </Stack>
      </Form>
    </FormProvider>
  );
}
