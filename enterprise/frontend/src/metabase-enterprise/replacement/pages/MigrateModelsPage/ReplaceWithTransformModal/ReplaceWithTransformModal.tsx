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
import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSubmitButton,
} from "metabase/forms";
import { SchemaFormSelect } from "metabase/transforms/components/SchemaFormSelect";
import { TagsMultiFormSelect } from "metabase/transforms/components/TagsMultiFormSelect";
import { TargetNameInput } from "metabase/transforms/components/TargetNameInput";
import {
  Box,
  Button,
  FocusTrap,
  Group,
  Input,
  Modal,
  Stack,
  Text,
} from "metabase/ui";
import * as Errors from "metabase/utils/errors";
import { slugify } from "metabase/utils/formatting/url";
import { useReplaceModelWithTransformMutation } from "metabase-enterprise/api";
import type { Card, Database } from "metabase-types/api";

const VALIDATION_SCHEMA = Yup.object({
  name: Yup.string().required(Errors.required),
  targetName: Yup.string().required(Errors.required),
  targetSchema: Yup.string().nullable().defined(),
  collectionId: Yup.number().nullable().defined(),
  tagIds: Yup.array().of(Yup.number().required()).defined(),
});

type ReplaceWithTransformValues = Yup.InferType<typeof VALIDATION_SCHEMA>;

type ReplaceWithTransformModalProps = {
  card: Card;
  opened: boolean;
  onClose: () => void;
};

export function ReplaceWithTransformModal({
  card,
  opened,
  onClose,
}: ReplaceWithTransformModalProps) {
  return (
    <Modal
      title={t`Convert this model to a transform?`}
      opened={opened}
      padding="xl"
      onClose={onClose}
    >
      <FocusTrap.InitialFocus />
      <ReplaceWithTransformLoader card={card} onClose={onClose} />
    </Modal>
  );
}

type ReplaceWithTransformLoaderProps = {
  card: Card;
  onClose: () => void;
};

function ReplaceWithTransformLoader({
  card,
  onClose,
}: ReplaceWithTransformLoaderProps) {
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
    return <DelayedLoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return (
    <ReplaceWithTransformForm
      card={card}
      database={database}
      schemas={schemas}
      onClose={onClose}
    />
  );
}

type ReplaceWithTransformFormProps = {
  card: Card;
  database: Database;
  schemas: string[];
  onClose: () => void;
};

function ReplaceWithTransformForm({
  card,
  database,
  schemas,
  onClose,
}: ReplaceWithTransformFormProps) {
  const [replaceModelWithTransform] = useReplaceModelWithTransformMutation();
  const supportsSchemas = hasFeature(database, "schemas");
  const initialValues: ReplaceWithTransformValues = useMemo(
    () => ({
      name: card.name,
      targetSchema: schemas[0] ?? null,
      targetName: slugify(card.name),
      collectionId: null,
      tagIds: [],
    }),
    [card.name, schemas],
  );

  const handleSubmit = async (values: ReplaceWithTransformValues) => {
    const action = replaceModelWithTransform({
      card_id: card.id,
      transform_name: values.name,
      transform_target: {
        type: "table",
        name: values.targetName,
        schema: values.targetSchema,
        database: database.id,
      },
      target_collection_id: values.collectionId,
      transform_tag_ids: values.tagIds,
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
            {t`We'll create a transform based on the model and replace usages of the model with the transform's output table. Then we'll convert the model to a saved question.`}
          </Text>
          <FormCollectionPicker
            name="collectionId"
            title={t`Folder to save this transform in`}
            collectionPickerModalProps={{ namespaces: ["transforms"] }}
            style={{ marginBottom: 0 }}
          />
          <Input.Wrapper label={t`Database this model belongs to`}>
            <Text>{database.name}</Text>
          </Input.Wrapper>
          {supportsSchemas && (
            <SchemaFormSelect
              name="targetSchema"
              label={t`Schema for the output table`}
              data={schemas}
            />
          )}
          <TargetNameInput />
          <TagsMultiFormSelect
            name="tagIds"
            label={t`Scheduling tags`}
            description={t`Transforms are run by jobs. Jobs run every transform with matching tags.`}
          />
          <Group gap="xs">
            <Box flex={1}>
              <FormErrorMessage />
            </Box>
            <Button variant="subtle" onClick={onClose}>{t`Cancel`}</Button>
            <FormSubmitButton
              label={t`Convert to a transform`}
              variant="filled"
            />
          </Group>
        </Stack>
      </Form>
    </FormProvider>
  );
}
