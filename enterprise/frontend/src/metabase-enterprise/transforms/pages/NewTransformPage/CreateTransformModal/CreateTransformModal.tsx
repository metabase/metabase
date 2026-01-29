import { useFormikContext } from "formik";
import { useMemo, useState } from "react";
import { t } from "ttag";
import _ from "underscore";
import type * as Yup from "yup";

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
  FormTextInput,
} from "metabase/forms";
import { Box, Button, Group, Modal, Stack } from "metabase/ui";
import { IncrementalTransformSettings } from "metabase-enterprise/transforms/components/IncrementalTransform/IncrementalTransformSettings";
import {
  QueryComplexityWarning,
  useQueryComplexityChecks,
} from "metabase-enterprise/transforms/components/QueryComplexityWarning";
import type {
  QueryComplexity,
  SchemaName,
  Transform,
  TransformSource,
  WorkspaceTransform,
} from "metabase-types/api";

import { SchemaFormSelect } from "../../../components/SchemaFormSelect";

import { TargetNameInput } from "./TargetNameInput";
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
  handleSubmit?: (
    values: NewTransformValues,
  ) => Promise<Transform | WorkspaceTransform>;
  targetDescription?: string;
  validateOnMount?: boolean;
  showIncrementalSettings?: boolean;
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
}: CreateTransformModalProps) {
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

  const schemas = useMemo(() => {
    return (fetchedSchemas ?? []).filter(schemasFilter || _.identity);
  }, [schemasFilter, fetchedSchemas]);
  const isLoading = isDatabaseLoading || isSchemasLoading;
  const error = databaseError ?? schemasError;

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
    <Modal title={t`Save your transform`} opened padding="xl" onClose={onClose}>
      <FormProvider
        initialValues={initialValues}
        validationSchema={validationSchema}
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
    </Modal>
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
  const { checkComplexity } = useQueryComplexityChecks();
  const [complexity, setComplexity] = useState<QueryComplexity | undefined>();

  const handleIncrementalChange = async (value: boolean) => {
    setFieldValue("incremental", value);
    if (value) {
      const complexity = await checkComplexity(source);
      setComplexity(complexity);
    } else {
      setComplexity(undefined);
    }
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
          type="transform-collections"
          style={{ marginBottom: 0 }}
        />
        {showIncrementalSettings && (
          <IncrementalTransformSettings
            source={source}
            incremental={values.incremental}
            onIncrementalChange={handleIncrementalChange}
          />
        )}
        {complexity && (
          <QueryComplexityWarning complexity={complexity} variant="standout" />
        )}
        <Group>
          <Box flex={1}>
            <FormErrorMessage />
          </Box>
          <Button onClick={onClose}>{t`Back`}</Button>
          <FormSubmitButton
            label={complexity ? t`Save anyway` : t`Save`}
            variant="filled"
            color={complexity ? "saturated-red" : undefined}
          />
        </Group>
      </Stack>
    </Form>
  );
}
