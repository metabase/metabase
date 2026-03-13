import { useMemo } from "react";
import { t } from "ttag";
import * as Yup from "yup";

import { hasFeature } from "metabase/admin/databases/utils";
import {
  skipToken,
  useCreateTransformMutation,
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
import { checkNotNull } from "metabase/lib/types";
import { SchemaFormSelect } from "metabase/transforms/components/SchemaFormSelect";
import { TargetNameInput } from "metabase/transforms/components/TargetNameInput";
import { Box, Button, Group, Input, Modal, Stack, Text } from "metabase/ui";
import { useReplaceSourceWithTransformMutation } from "metabase-enterprise/api";
import type {
  Card,
  CreateTransformRequest,
  Database,
  ReplaceSourceWithTransformRequest,
  Transform,
} from "metabase-types/api";

const VALIDATION_SCHEMA = Yup.object({
  name: Yup.string().required(Errors.required),
  targetName: Yup.string().required(Errors.required),
  targetSchema: Yup.string().nullable().defined(),
  collectionId: Yup.number().nullable().defined(),
  replaceSource: Yup.boolean().defined(),
  unpersisteCard: Yup.boolean().defined(),
  archiveCard: Yup.boolean().defined(),
});

type ConvertToTransformValues = Yup.InferType<typeof VALIDATION_SCHEMA>;

type ConvertToTransformModalProps = {
  card: Card;
  opened: boolean;
  onClose: () => void;
};

export function ConvertToTransformModal({
  card,
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
      <ConvertToTransformLoader card={card} onClose={onClose} />
    </Modal>
  );
}

type ConvertToTransformLoaderProps = {
  card: Card;
  onClose: () => void;
};

function ConvertToTransformLoader({
  card,
  onClose,
}: ConvertToTransformLoaderProps) {
  const databaseId = card.database_id;

  const {
    data: database,
    isLoading: isDatabaseLoading,
    error: databaseError,
  } = useGetDatabaseQuery(databaseId != null ? { id: databaseId } : skipToken);

  const {
    data: schemas = [],
    isLoading: isSchemasLoading,
    error: schemasError,
  } = useListSyncableDatabaseSchemasQuery(databaseId ?? skipToken);

  const isLoading = isDatabaseLoading || isSchemasLoading;
  const error = databaseError ?? schemasError;

  if (isLoading || error != null || database == null) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return (
    <ConvertToTransformForm
      card={card}
      database={database}
      schemas={schemas}
      onClose={onClose}
    />
  );
}

type ConvertToTransformFormProps = {
  card: Card;
  database: Database;
  schemas: string[];
  onClose: () => void;
};

function ConvertToTransformForm({
  card,
  database,
  schemas,
  onClose,
}: ConvertToTransformFormProps) {
  const supportsSchemas = hasFeature(database, "schemas");

  const initialValues: ConvertToTransformValues = useMemo(
    () => ({
      name: card.name,
      targetSchema: schemas[0] ?? null,
      targetName: slugify(card.name),
      collectionId: null,
      replaceSource: true,
      unpersisteCard: true,
      archiveCard: true,
    }),
    [card.name, schemas],
  );

  const [createTransform] = useCreateTransformMutation();
  const [replaceSourceWithTransform] = useReplaceSourceWithTransformMutation();

  const handleSubmit = async (values: ConvertToTransformValues) => {
    const transform = await createTransform(
      getCreateTransformRequest(card, values),
    ).unwrap();

    if (values.replaceSource) {
      await replaceSourceWithTransform(
        getReplaceSourceRequest(card, transform, values),
      ).unwrap();
    }

    onClose();
  };

  return (
    <FormProvider
      initialValues={initialValues}
      validationSchema={VALIDATION_SCHEMA}
      onSubmit={handleSubmit}
    >
      {({ values }) => (
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
              name="collectionId"
              title={t`Collection`}
              collectionPickerModalProps={{ namespaces: ["transforms"] }}
              style={{ marginBottom: 0 }}
            />
            <FormSwitch
              name="replaceSource"
              label={t`Replace data source of all this models dependents`}
              description={t`We'll run the new transform, then update all dependents of the original model to use the transform's output table instead. You can always do this later with the data replacement tool.`}
              size="sm"
            />
            <FormSwitch
              name="unpersisteCard"
              label={t`Un-persist model data`}
              description={
                values.replaceSource
                  ? t`We'll unpersist the model data after updating dependents.`
                  : t`We'll unpersist the model data after creating the transform.`
              }
              size="sm"
            />
            <FormSwitch
              name="archiveCard"
              label={t`Put this model in the trash`}
              description={
                values.replaceSource
                  ? t`We'll put the model in the trash after updating dependents.`
                  : t`We'll put the model in the trash after creating the transform.`
              }
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
      )}
    </FormProvider>
  );
}

function getCreateTransformRequest(
  card: Card,
  values: ConvertToTransformValues,
): CreateTransformRequest {
  return {
    name: card.name,
    source: {
      type: "query",
      query: card.dataset_query,
    },
    target: {
      type: "table",
      name: values.targetName,
      schema: values.targetSchema,
      database: checkNotNull(card.database_id),
    },
    collection_id: values.collectionId,
  };
}

function getReplaceSourceRequest(
  card: Card,
  transform: Transform,
  values: ConvertToTransformValues,
): ReplaceSourceWithTransformRequest {
  return {
    source_entity_id: card.id,
    source_entity_type: "card",
    transform_id: transform.id,
    unpersist_card: values.unpersisteCard,
    archive_card: values.archiveCard,
  };
}
