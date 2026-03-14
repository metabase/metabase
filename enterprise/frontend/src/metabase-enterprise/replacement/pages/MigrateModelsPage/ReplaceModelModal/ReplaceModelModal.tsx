import { useMemo } from "react";
import { t } from "ttag";
import * as Yup from "yup";

import { hasFeature } from "metabase/admin/databases/utils";
import {
  skipToken,
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
} from "metabase/forms";
import * as Errors from "metabase/lib/errors";
import { slugify } from "metabase/lib/formatting/url";
import { SchemaFormSelect } from "metabase/transforms/components/SchemaFormSelect";
import { TargetNameInput } from "metabase/transforms/components/TargetNameInput";
import { Box, Button, Group, Input, Modal, Stack, Text } from "metabase/ui";
import { useReplaceModelMutation } from "metabase-enterprise/api";
import type { Card, Database } from "metabase-types/api";

const VALIDATION_SCHEMA = Yup.object({
  name: Yup.string().required(Errors.required),
  targetName: Yup.string().required(Errors.required),
  targetSchema: Yup.string().nullable().defined(),
  collectionId: Yup.number().nullable().defined(),
});

type ReplaceModelValues = Yup.InferType<typeof VALIDATION_SCHEMA>;

type ReplaceModelModalProps = {
  card: Card;
  isOpened: boolean;
  onClose: () => void;
};

export function ReplaceModelModal({
  card,
  isOpened,
  onClose,
}: ReplaceModelModalProps) {
  return (
    <Modal
      title={t`Convert this model to a transform?`}
      opened={isOpened}
      padding="xl"
      onClose={onClose}
    >
      <ReplaceModelLoader card={card} onClose={onClose} />
    </Modal>
  );
}

type ReplaceModelLoaderProps = {
  card: Card;
  onClose: () => void;
};

function ReplaceModelLoader({ card, onClose }: ReplaceModelLoaderProps) {
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
    <ReplaceModelForm
      card={card}
      database={database}
      schemas={schemas}
      onClose={onClose}
    />
  );
}

type ReplaceModelFormProps = {
  card: Card;
  database: Database;
  schemas: string[];
  onClose: () => void;
};

function ReplaceModelForm({
  card,
  database,
  schemas,
  onClose,
}: ReplaceModelFormProps) {
  const [replaceModel] = useReplaceModelMutation();
  const supportsSchemas = hasFeature(database, "schemas");
  const initialValues: ReplaceModelValues = useMemo(
    () => ({
      name: card.name,
      targetSchema: schemas[0] ?? null,
      targetName: slugify(card.name),
      collectionId: null,
    }),
    [card.name, schemas],
  );

  const handleSubmit = async (values: ReplaceModelValues) => {
    const action = replaceModel({
      card_id: card.id,
      transform_name: values.name,
      transform_target: {
        type: "table",
        name: values.targetName,
        schema: values.targetSchema,
        database: database.id,
      },
      target_collection_id: values.collectionId,
    });
    await action.unwrap();
    onClose();
  };

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
            name="collectionId"
            title={t`Collection`}
            collectionPickerModalProps={{ namespaces: ["transforms"] }}
            style={{ marginBottom: 0 }}
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
