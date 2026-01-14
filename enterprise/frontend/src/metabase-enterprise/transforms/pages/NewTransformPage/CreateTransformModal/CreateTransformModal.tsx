import { useMemo } from "react";
import { t } from "ttag";
import type * as Yup from "yup";

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
import type {
  Transform,
  TransformSource,
  WorkspaceTransform,
} from "metabase-types/api";

import { SchemaFormSelect } from "../../../components/SchemaFormSelect";

import { TargetNameInput } from "./TargetNameInput";
import type { NewTransformValues } from "./form";
import { useCreateTransform } from "./hooks";

export type ValidationSchemaExtension = Record<string, Yup.AnySchema>;

type CreateTransformModalProps = {
  source: TransformSource;
  defaultValues: Partial<NewTransformValues>;
  onCreate?: (transform: Transform) => void;
  onClose: () => void;
  schemas?: string[] | null;
  showIncrementalSettings?: boolean;
  validationSchemaExtension?: ValidationSchemaExtension;
  handleSubmit?: (
    values: NewTransformValues,
  ) => Promise<Transform | WorkspaceTransform>;
  targetDescription?: string;
  validateOnMount?: boolean;
};

export function CreateTransformModal({
  source,
  defaultValues,
  onCreate,
  onClose,
  schemas,
  showIncrementalSettings = true,
  validationSchemaExtension,
  handleSubmit,
  targetDescription,
  validateOnMount,
}: CreateTransformModalProps) {
  return (
    <Modal title={t`Save your transform`} opened padding="xl" onClose={onClose}>
      <CreateTransformForm
        source={source}
        defaultValues={defaultValues}
        onCreate={onCreate}
        onClose={onClose}
        schemas={schemas}
        showIncrementalSettings={showIncrementalSettings}
        validationSchemaExtension={validationSchemaExtension}
        handleSubmit={handleSubmit}
        targetDescription={targetDescription}
        validateOnMount={validateOnMount}
      />
    </Modal>
  );
}

type CreateTransformFormProps = {
  source: TransformSource;
  defaultValues: Partial<NewTransformValues>;
  onCreate?: (transform: Transform) => void;
  onClose: () => void;
  schemas?: string[] | null;
  showIncrementalSettings?: boolean;
  validationSchemaExtension?: ValidationSchemaExtension;
  handleSubmit?: (
    values: NewTransformValues,
  ) => Promise<Transform | WorkspaceTransform>;
  targetDescription?: string;
  validateOnMount?: boolean;
};

function CreateTransformForm({
  source,
  defaultValues,
  onCreate,
  onClose,
  schemas: schemasProp,
  showIncrementalSettings = true,
  handleSubmit,
  targetDescription,
  validationSchemaExtension,
  validateOnMount,
}: CreateTransformFormProps) {
  const databaseId =
    source.type === "query" ? source.query.database : source["source-database"];

  const shouldFetchSchemas = schemasProp === undefined;
  const showSchemaField = schemasProp !== null;

  const {
    data: database,
    isLoading: isDatabaseLoading,
    error: databaseError,
  } = useGetDatabaseQuery(databaseId ? { id: databaseId } : skipToken);

  const {
    data: fetchedSchemas = [],
    isLoading: isSchemasLoading,
    error: schemasError,
  } = useListDatabaseSchemasQuery(
    shouldFetchSchemas && databaseId
      ? { id: databaseId, include_hidden: true }
      : skipToken,
  );

  const schemas = useMemo(
    () => schemasProp ?? fetchedSchemas ?? [],
    [schemasProp, fetchedSchemas],
  );
  const isLoading =
    isDatabaseLoading || (shouldFetchSchemas && isSchemasLoading);
  const error = databaseError ?? (shouldFetchSchemas ? schemasError : null);

  const supportsSchemas = database && hasFeature(database, "schemas");

  const {
    initialValues,
    validationSchema: defaultSchema,
    createTransform,
  } = useCreateTransform(schemas, defaultValues);

  const validationSchema = useMemo(
    () =>
      validationSchemaExtension
        ? defaultSchema.shape(validationSchemaExtension)
        : defaultSchema,
    [validationSchemaExtension, defaultSchema],
  );

  if (isLoading || error != null) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  const defaultHandleSubmit = async (values: NewTransformValues) => {
    if (!databaseId) {
      throw new Error("Database ID is required");
    }
    const transform = await createTransform(databaseId, source, values);
    onCreate?.(transform);
  };

  return (
    <FormProvider
      initialValues={initialValues}
      validationSchema={validationSchema}
      onSubmit={handleSubmit || defaultHandleSubmit}
      validateOnMount={validateOnMount}
    >
      <Form>
        <Stack gap="lg" mt="sm">
          <FormTextInput
            name="name"
            label={t`Name`}
            placeholder={t`My Great Transform`}
            data-autofocus
          />
          {showSchemaField && supportsSchemas && (
            <SchemaFormSelect
              name="targetSchema"
              label={t`Schema`}
              data={schemas}
            />
          )}
          <TargetNameInput description={targetDescription} />
          <FormCollectionPicker
            name="collection_id"
            title={t`Collection`}
            type="transform-collections"
            style={{ marginBottom: 0 }}
          />
          {showIncrementalSettings && (
            <IncrementalTransformSettings source={source} />
          )}
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
