import { useFormikContext } from "formik";
import { useCallback, useEffect, useMemo, useState } from "react";
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
import { IncrementalTransformSettings } from "metabase/transforms/components/IncrementalTransform/IncrementalTransformSettings";
import {
  QueryComplexityWarning,
  useQueryComplexityChecks,
} from "metabase/transforms/components/QueryComplexityWarning";
import { Box, Button, Group, Modal, Stack } from "metabase/ui";
import type {
  Database,
  DraftTransformSource,
  QueryComplexity,
  SchemaName,
  Transform,
  TransformSource,
  WorkspaceTransform,
} from "metabase-types/api";
import { isAdvancedTransformSource } from "metabase-types/api";

import { DatabaseFormSelect } from "../../../components/DatabaseFormSelect";
import { SchemaFormSelect } from "../../../components/SchemaFormSelect";

import { TargetNameInput } from "./TargetNameInput";
import type { NewTransformValues } from "./form";
import { useCreateTransform } from "./hooks";

export type ValidationSchemaExtension = Record<string, Yup.AnySchema>;

type SchemasFilter = (schema: SchemaName) => boolean;

type CreateTransformModalProps = {
  source: DraftTransformSource;
  defaultValues: Partial<NewTransformValues>;
  databases?: Database[];
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
  databases,
  onCreate,
  onClose,
  schemasFilter,
  validationSchemaExtension,
  handleSubmit,
  targetDescription,
  validateOnMount,
  showIncrementalSettings,
}: CreateTransformModalProps) {
  const isAdvanced = isAdvancedTransformSource(source);
  const sourceDatabaseId =
    source.type === "query" ? source.query.database : undefined;

  const {
    data: database,
    isLoading: isDatabaseLoading,
    error: databaseError,
  } = useGetDatabaseQuery(
    sourceDatabaseId ? { id: sourceDatabaseId } : skipToken,
  );

  const {
    data: fetchedSchemas = [],
    isLoading: isSchemasLoading,
    error: schemasError,
  } = useListSyncableDatabaseSchemasQuery(sourceDatabaseId ?? skipToken);

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

  const defaultHandleSubmit = async (values: NewTransformValues) => {
    let resolvedDatabaseId: number;
    let resolvedSource: TransformSource;

    if (isAdvanced) {
      if (!values.targetDatabaseId) {
        throw new Error("Database ID is required");
      }
      resolvedDatabaseId = Number(values.targetDatabaseId);
      resolvedSource = {
        ...source,
        "source-database": resolvedDatabaseId,
      };
    } else {
      if (!sourceDatabaseId) {
        throw new Error("Database ID is required");
      }
      resolvedDatabaseId = sourceDatabaseId;
      resolvedSource = source;
    }

    const transform = await createTransform(
      resolvedDatabaseId,
      resolvedSource,
      values,
    );
    onCreate?.(transform);
  };

  return (
    <Modal title={t`Save your transform`} opened padding="xl" onClose={onClose}>
      {isLoading || error != null ? (
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      ) : (
        <FormProvider
          initialValues={initialValues}
          validationSchema={validationSchema}
          onSubmit={handleSubmit || defaultHandleSubmit}
          validateOnMount={validateOnMount}
        >
          <CreateTransformForm
            source={source}
            databases={databases}
            supportsSchemas={supportsSchemas}
            schemas={schemas}
            schemasFilter={schemasFilter}
            onClose={onClose}
            targetDescription={targetDescription}
            showIncrementalSettings={showIncrementalSettings}
          />
        </FormProvider>
      )}
    </Modal>
  );
}

type CreateTransformFormFieldsProps = {
  source: DraftTransformSource;
  databases?: Database[];
  supportsSchemas: boolean | undefined;
  schemas: string[];
  schemasFilter?: SchemasFilter;
  onClose: () => void;
  targetDescription?: string;
  showIncrementalSettings?: boolean;
};

function CreateTransformForm({
  source,
  databases,
  supportsSchemas,
  schemas,
  schemasFilter,
  onClose,
  targetDescription,
  showIncrementalSettings = true,
}: CreateTransformFormFieldsProps) {
  const { values, setFieldValue } = useFormikContext<NewTransformValues>();
  const { checkComplexity } = useQueryComplexityChecks();
  const [complexity, setComplexity] = useState<QueryComplexity | undefined>();

  const isAdvanced = isAdvancedTransformSource(source);

  // For advanced transforms, fetch database + schemas based on user selection
  const selectedDatabaseId =
    isAdvanced && values.targetDatabaseId
      ? Number(values.targetDatabaseId)
      : undefined;

  const { data: selectedDatabase } = useGetDatabaseQuery(
    selectedDatabaseId != null ? { id: selectedDatabaseId } : skipToken,
  );

  const { data: fetchedAdvancedSchemas = [] } =
    useListSyncableDatabaseSchemasQuery(selectedDatabaseId ?? skipToken);

  const filteredAdvancedSchemas = useMemo(() => {
    return fetchedAdvancedSchemas.filter(schemasFilter || _.identity);
  }, [fetchedAdvancedSchemas, schemasFilter]);

  const effectiveSchemas = isAdvanced ? filteredAdvancedSchemas : schemas;
  const effectiveSupportsSchemas = isAdvanced
    ? selectedDatabase != null && hasFeature(selectedDatabase, "schemas")
    : supportsSchemas;

  // Default targetSchema to first available schema after database selection
  useEffect(() => {
    if (
      isAdvanced &&
      values.targetSchema == null &&
      filteredAdvancedSchemas.length > 0
    ) {
      setFieldValue("targetSchema", filteredAdvancedSchemas[0]);
    }
  }, [isAdvanced, filteredAdvancedSchemas, values.targetSchema, setFieldValue]);

  const handleDatabaseChange = useCallback(
    (_value: string) => {
      setFieldValue("targetSchema", null);
    },
    [setFieldValue],
  );

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
        {isAdvanced && (
          <DatabaseFormSelect
            name="targetDatabaseId"
            label={t`Target database`}
            databases={
              databases?.filter((db) => hasFeature(db, "transforms/python")) ??
              []
            }
            onChange={handleDatabaseChange}
          />
        )}
        {effectiveSupportsSchemas && (
          <SchemaFormSelect
            name="targetSchema"
            label={t`Schema`}
            data={effectiveSchemas}
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
        {complexity && <QueryComplexityWarning variant="standout" />}
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
