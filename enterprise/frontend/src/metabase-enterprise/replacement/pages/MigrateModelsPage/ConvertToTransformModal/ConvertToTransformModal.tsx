import { useMemo } from "react";
import { t } from "ttag";
import * as Yup from "yup";

import { hasFeature } from "metabase/admin/databases/utils";
import {
  skipToken,
  useCreateTransformMutation,
  useGetCardQuery,
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
  CardId,
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
  unpersistModel: Yup.boolean().defined(),
  replaceSource: Yup.boolean().defined(),
});

type ConvertToTransformValues = Yup.InferType<typeof VALIDATION_SCHEMA>;

type ConvertToTransformModalProps = {
  cardId: CardId;
  opened: boolean;
  onClose: () => void;
};

export function ConvertToTransformModal({
  cardId,
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
      <ConvertToTransformLoader cardId={cardId} onClose={onClose} />
    </Modal>
  );
}

type ConvertToTransformLoaderProps = {
  cardId: CardId;
  onClose: () => void;
};

function ConvertToTransformLoader({
  cardId,
  onClose,
}: ConvertToTransformLoaderProps) {
  const {
    data: card,
    isLoading: isCardLoading,
    error: cardError,
  } = useGetCardQuery({ id: cardId });

  const databaseId = card?.database_id;

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

  const isLoading = isCardLoading || isDatabaseLoading || isSchemasLoading;
  const error = cardError ?? databaseError ?? schemasError;

  if (isLoading || error != null || card == null || database == null) {
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
      unpersistModel: true,
      replaceSource: true,
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
      {({ values, setFieldValue }) => (
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
              label={t`Replace data source of all existing dependents`}
              description={t`We'll run the new transform and update all dependents of the original model to use the transform's output table instead. If you don't want to do this now, you can do it later with the Data Replacement tool.`}
              size="sm"
              onChange={(event) =>
                setFieldValue("unpersistModel", event.target.checked)
              }
            />
            <FormSwitch
              name="unpersistModel"
              label={t`Unpersist model data`}
              description={t`The original model will be unpersisted after running the transform and updating all dependents to use the transform's output table.`}
              size="sm"
              disabled={!values.replaceSource}
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
    unpersist_model: values.unpersistModel,
  };
}
