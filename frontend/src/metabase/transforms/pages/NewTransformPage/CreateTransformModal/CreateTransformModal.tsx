import { useFormikContext } from "formik";
import { useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";
import type * as Yup from "yup";

import {
  skipToken,
  useGetDatabaseQuery,
  useGetRootCollectionQuery,
  useListSyncableDatabaseSchemasQuery,
} from "metabase/api";
import FormCollectionPicker from "metabase/common/collections/containers/FormCollectionPicker";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { hasFeature } from "metabase/common/utils/database";
import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSubmitButton,
  FormTextInput,
} from "metabase/forms";
import { IncrementalTransformSettings } from "metabase/transforms/components/IncrementalTransform/IncrementalTransformSettings";
import { Box, Button, Group, Modal, Stack } from "metabase/ui";
import type {
  Collection,
  Database,
  SchemaName,
  Transform,
  TransformSource,
} from "metabase-types/api";

import { SchemaFormSelect } from "../../../components/SchemaFormSelect";
import { TargetNameInput } from "../../../components/TargetNameInput";

import type { NewTransformValues } from "./form";
import { useCreateTransform } from "./hooks";

export type ValidationSchemaExtension = Record<string, Yup.AnySchema>;

type SchemasFilter = (schema: SchemaName) => boolean;

type CreateTransformModalProps = {
  source: TransformSource;
  defaultValues: Partial<NewTransformValues>;
  onCreate?: (transform: Transform) => void;
  onClose: () => void;
  schemasFilter?: SchemasFilter;
  validationSchemaExtension?: ValidationSchemaExtension;
  handleSubmit?: (values: NewTransformValues) => Promise<Transform>;
  targetDescription?: string;
  validateOnMount?: boolean;
  showIncrementalSettings?: boolean;
  closeOnEscape?: boolean;
};

export function CreateTransformModal({
  source,
  defaultValues,
  onCreate,
  onClose,
  schemasFilter,
  validationSchemaExtension,
  handleSubmit,
  targetDescription,
  validateOnMount,
  showIncrementalSettings,
  closeOnEscape,
}: CreateTransformModalProps) {
  return (
    <Modal
      title={t`Save your transform`}
      opened
      padding="xl"
      closeOnEscape={closeOnEscape}
      onClose={onClose}
    >
      <CreateTransformModalLoader
        source={source}
        defaultValues={defaultValues}
        onCreate={onCreate}
        onClose={onClose}
        schemasFilter={schemasFilter}
        validationSchemaExtension={validationSchemaExtension}
        handleSubmit={handleSubmit}
        targetDescription={targetDescription}
        validateOnMount={validateOnMount}
        showIncrementalSettings={showIncrementalSettings}
      />
    </Modal>
  );
}

type CreateTransformModalLoaderProps = Omit<
  CreateTransformModalProps,
  "closeOnEscape"
>;

function CreateTransformModalLoader({
  source,
  defaultValues,
  onCreate,
  onClose,
  schemasFilter,
  validationSchemaExtension,
  handleSubmit,
  targetDescription,
  validateOnMount,
  showIncrementalSettings,
}: CreateTransformModalLoaderProps) {
  const databaseId =
    source.type === "query" ? source.query.database : source["source-database"];

  const {
    data: database,
    isLoading: isDatabaseLoading,
    error: databaseError,
  } = useGetDatabaseQuery(databaseId ? { id: databaseId } : skipToken);

  const {
    data: fetchedSchemas = [],
    isLoading: isSchemasLoading,
    error: schemasError,
  } = useListSyncableDatabaseSchemasQuery(databaseId ?? skipToken);

  const {
    data: rootCollection,
    isLoading: isRootCollectionLoading,
    error: rootCollectionError,
  } = useGetRootCollectionQuery({ namespace: "transforms" });

  const schemas = useMemo(() => {
    return (fetchedSchemas ?? []).filter(schemasFilter || _.identity);
  }, [schemasFilter, fetchedSchemas]);
  const isLoading =
    isDatabaseLoading || isSchemasLoading || isRootCollectionLoading;
  const error = databaseError ?? schemasError ?? rootCollectionError;

  if (isLoading || error != null || rootCollection == null) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return (
    <CreateTransformModalForm
      source={source}
      defaultValues={defaultValues}
      onCreate={onCreate}
      onClose={onClose}
      validationSchemaExtension={validationSchemaExtension}
      handleSubmit={handleSubmit}
      targetDescription={targetDescription}
      validateOnMount={validateOnMount}
      showIncrementalSettings={showIncrementalSettings}
      database={database}
      schemas={schemas}
      rootCollection={rootCollection}
    />
  );
}

type CreateTransformModalFormProps = Omit<
  CreateTransformModalLoaderProps,
  "schemasFilter"
> & {
  database: Database | undefined;
  schemas: string[];
  rootCollection: Collection;
};

function CreateTransformModalForm({
  source,
  defaultValues,
  onCreate,
  onClose,
  validationSchemaExtension,
  handleSubmit,
  targetDescription,
  validateOnMount,
  showIncrementalSettings,
  database,
  schemas,
  rootCollection,
}: CreateTransformModalFormProps) {
  const databaseId =
    source.type === "query" ? source.query.database : source["source-database"];
  const supportsSchemas = database && hasFeature(database, "schemas");

  const {
    initialValues,
    validationSchema: defaultSchema,
    createTransform,
  } = useCreateTransform(schemas, defaultValues, rootCollection.id);

  const validationSchema = useMemo(
    () =>
      validationSchemaExtension
        ? defaultSchema.shape(validationSchemaExtension)
        : defaultSchema,
    [validationSchemaExtension, defaultSchema],
  );

  const validationContext = useMemo(
    () => ({ supportsSchemas: Boolean(supportsSchemas) }),
    [supportsSchemas],
  );

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
      validationContext={validationContext}
      onSubmit={handleSubmit || defaultHandleSubmit}
      validateOnMount={validateOnMount}
    >
      <CreateTransformForm
        source={source}
        supportsSchemas={supportsSchemas}
        schemas={schemas}
        onClose={onClose}
        targetDescription={targetDescription}
        showIncrementalSettings={showIncrementalSettings}
      />
    </FormProvider>
  );
}

type CreateTransformFormFieldsProps = {
  source: TransformSource;
  supportsSchemas: boolean | undefined;
  schemas: string[];
  onClose: () => void;
  targetDescription?: string;
  showIncrementalSettings?: boolean;
};

function CreateTransformForm({
  source,
  supportsSchemas,
  schemas,
  onClose,
  targetDescription,
  showIncrementalSettings = true,
}: CreateTransformFormFieldsProps) {
  const { values, setFieldValue } = useFormikContext<NewTransformValues>();

  const handleIncrementalChange = (value: boolean) => {
    setFieldValue("incremental", value);
  };

  return (
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
        <TargetNameInput description={targetDescription} />
        <FormCollectionPicker
          name="collection_id"
          title={t`Collection`}
          collectionPickerModalProps={{ namespaces: ["transforms"] }}
          style={{ marginBottom: 0 }}
        />
        {showIncrementalSettings && (
          <IncrementalTransformSettings
            source={source}
            incremental={values.incremental}
            onIncrementalChange={handleIncrementalChange}
          />
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
  );
}
