import { useMemo } from "react";
import { t } from "ttag";
import * as Yup from "yup";

import { hasFeature } from "metabase/admin/databases/utils";
import {
  useGetDatabaseQuery,
  useListSyncableDatabaseSchemasQuery,
} from "metabase/api";
import FormCollectionPicker from "metabase/collections/containers/FormCollectionPicker";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSubmitButton,
  FormSwitch,
} from "metabase/forms";
import * as Errors from "metabase/lib/errors";
import { slugify } from "metabase/lib/formatting/url";
import { SchemaFormSelect } from "metabase/transforms/components/SchemaFormSelect";
import { TargetNameInput } from "metabase/transforms/components/TargetNameInput";
import { Box, Button, Group, Input, Modal, Stack, Text } from "metabase/ui";
import { useConvertCardToTransformMutation } from "metabase-enterprise/api";
import type { SearchResult } from "metabase-types/api";

const VALIDATION_SCHEMA = Yup.object({
  name: Yup.string().required(Errors.required),
  targetName: Yup.string().required(Errors.required),
  targetSchema: Yup.string().nullable().defined(),
  collection_id: Yup.number().nullable().defined(),
  replace_dependents: Yup.boolean().defined(),
});

type ConvertToTransformValues = Yup.InferType<typeof VALIDATION_SCHEMA>;

type ConvertToTransformModalProps = {
  result: SearchResult;
  opened: boolean;
  onClose: () => void;
};

export function ConvertToTransformModal({
  result,
  opened,
  onClose,
}: ConvertToTransformModalProps) {
  return (
    <Modal
      title={t`Convert this model to a transform?`}
      opened={opened}
      padding="xl"
      onClose={onClose}
    >
      <ConvertToTransformForm result={result} onClose={onClose} />
    </Modal>
  );
}

type ConvertToTransformFormProps = {
  result: SearchResult;
  onClose: () => void;
};

function ConvertToTransformForm({
  result,
  onClose,
}: ConvertToTransformFormProps) {
  const databaseId = result.database_id;
  if (databaseId == null) {
    throw new Error("database_id is required on the search result");
  }

  const {
    data: database,
    isLoading: isDatabaseLoading,
    error: databaseError,
  } = useGetDatabaseQuery({ id: databaseId });

  const {
    data: schemas = [],
    isLoading: isSchemasLoading,
    error: schemasError,
  } = useListSyncableDatabaseSchemasQuery(databaseId);

  const supportsSchemas = database && hasFeature(database, "schemas");
  const isLoading = isDatabaseLoading || isSchemasLoading;
  const error = databaseError ?? schemasError;

  const initialValues: ConvertToTransformValues = useMemo(
    () => ({
      name: result.name,
      targetSchema: schemas[0] ?? null,
      targetName: slugify(result.name),
      collection_id: null,
      replace_dependents: true,
    }),
    [result.name, schemas],
  );

  const [convertCardToTransform] = useConvertCardToTransformMutation();

  const handleSubmit = async (values: ConvertToTransformValues) => {
    await convertCardToTransform({
      card_id: Number(result.id),
      transform_name: result.name,
      transform_target: {
        name: values.targetName,
        schema: values.targetSchema,
        database: databaseId,
      },
      collection_id: values.collection_id,
      replace_dependents: values.replace_dependents,
    }).unwrap();
    onClose();
  };

  if (isLoading || error != null || database == null) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return (
    <FormProvider
      initialValues={initialValues}
      validationSchema={VALIDATION_SCHEMA}
      onSubmit={handleSubmit}
    >
      <Form>
        <Stack gap="lg" mt="sm">
          <Text>
            {t`We'll create a transform based on the model, with the same name.`}
          </Text>
          <Input.Wrapper label={t`Database`}>
            <Text>{database.name}</Text>
          </Input.Wrapper>
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
            collectionPickerModalProps={{ namespaces: ["transforms"] }}
            style={{ marginBottom: 0 }}
          />
          <FormSwitch
            name="replace_dependents"
            label={t`Replace data source of all existing dependents`}
            description={t`All dependents of the original model will be updated to use the output table instead. If you don't want to do this now, you can do it later with the Data Replacement tool.`}
            size="sm"
          />
          <Group>
            <Box flex={1}>
              <FormErrorMessage />
            </Box>
            <Button onClick={onClose}>{t`Cancel`}</Button>
            <FormSubmitButton label={t`Convert`} variant="filled" />
          </Group>
        </Stack>
      </Form>
    </FormProvider>
  );
}
