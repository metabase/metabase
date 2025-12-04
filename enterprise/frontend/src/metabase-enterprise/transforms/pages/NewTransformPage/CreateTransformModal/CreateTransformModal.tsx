import { useMemo } from "react";
import { t } from "ttag";
import * as Yup from "yup";

import { hasFeature } from "metabase/admin/databases/utils";
import {
  skipToken,
  useGetDatabaseQuery,
  useListDatabaseSchemasQuery,
} from "metabase/api";
import { getErrorMessage } from "metabase/api/utils";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useToast } from "metabase/common/hooks";
import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSubmitButton,
  FormTextInput,
} from "metabase/forms";
import * as Errors from "metabase/lib/errors";
import { Box, Button, Group, Modal, Stack } from "metabase/ui";
import { useCreateTransformMutation } from "metabase-enterprise/api";
import { IncrementalTransformSettings } from "metabase-enterprise/transforms/components/IncrementalTransform/IncrementalTransformSettings";
import type {
  CreateTransformRequest,
  Transform,
  TransformSource,
} from "metabase-types/api";

import { trackTransformCreated } from "../../../analytics";

import { SchemaFormSelect } from "./../../../components/SchemaFormSelect";

const DEFAULT_VALIDATION_SCHEMA = Yup.object({
  name: Yup.string().required(Errors.required),
  targetName: Yup.string().required(Errors.required),
  targetSchema: Yup.string().nullable().defined(),
  incremental: Yup.boolean().required(),
  // For native queries, use checkpointFilter (plain string)
  checkpointFilter: Yup.string().nullable(),
  // For MBQL/Python queries, use checkpointFilterUniqueKey (prefixed format)
  checkpointFilterUniqueKey: Yup.string().nullable(),
  sourceStrategy: Yup.mixed<"checkpoint">().oneOf(["checkpoint"]).required(),
  targetStrategy: Yup.mixed<"append">().oneOf(["append"]).required(),
});

export type NewTransformValues = Yup.InferType<typeof DEFAULT_VALIDATION_SCHEMA>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ValidationSchemaExtension = Record<string, Yup.AnySchema>;

function getValidationSchema(extension?: ValidationSchemaExtension) {
  if (!extension) {
    return DEFAULT_VALIDATION_SCHEMA;
  }
  return DEFAULT_VALIDATION_SCHEMA.shape(extension);
}

type CreateTransformModalProps = {
  source: TransformSource;
  defaultValues: Partial<NewTransformValues>;
  onCreate?: (transform: Transform) => void;
  onClose: () => void;
  schemas?: string[] | null;
  showIncrementalSettings?: boolean;
  validationSchemaExtension?: ValidationSchemaExtension;
  handleSubmit?: (values: NewTransformValues) => Promise<Transform>;
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
  handleSubmit?: (values: NewTransformValues) => Promise<Transform>;
};

function CreateTransformForm({
  source,
  defaultValues,
  onCreate,
  onClose,
  schemas: schemasProp,
  showIncrementalSettings = true,
  validationSchemaExtension,
  handleSubmit,
}: CreateTransformFormProps) {
  const [sendToast] = useToast();
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

  const [createTransform] = useCreateTransformMutation();
  const supportsSchemas = database && hasFeature(database, "schemas");

  const initialValues: NewTransformValues = useMemo(
    () => getInitialValues(schemas, defaultValues),
    [schemas, defaultValues],
  );

  const validationSchema = useMemo(
    () => getValidationSchema(validationSchemaExtension),
    [validationSchemaExtension],
  );

  if (isLoading || error != null) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  const defaultHandleSubmit = async (values: NewTransformValues) => {
    if (!databaseId) {
      throw new Error("Database ID is required");
    }
    const request = getCreateRequest(source, values, databaseId);
    try {
      const transform = await createTransform(request).unwrap();
      trackTransformCreated({ transformId: transform.id });
      onCreate?.(transform);
    } catch (error) {
      sendToast({
        message: getErrorMessage(error, t`Failed to create transform`),
        icon: "warning",
      });
    }
  };

  return (
    <FormProvider
      initialValues={initialValues}
      validationSchema={validationSchema}
      onSubmit={handleSubmit || defaultHandleSubmit}
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
          <FormTextInput
            name="targetName"
            label={t`Table name`}
            placeholder={t`descriptive_name`}
          />
          {showIncrementalSettings && (
            <IncrementalTransformSettings source={source} />
          )}
          <Group>
            <Box flex={1}>
              <FormErrorMessage />
            </Box>
            <Button variant="subtle" onClick={onClose}>{t`Back`}</Button>
            <FormSubmitButton label={t`Save`} variant="filled" />
          </Group>
        </Stack>
      </Form>
    </FormProvider>
  );
}

function getInitialValues(
  schemas: string[] | null,
  defaultValues: Partial<NewTransformValues>,
): NewTransformValues {
  return {
    name: "",
    targetName: "",
    targetSchema: schemas?.[0] || null,
    ...defaultValues,
    checkpointFilter: null,
    checkpointFilterUniqueKey: null,
    incremental: false,
    sourceStrategy: "checkpoint",
    targetStrategy: "append",
  };
}

function getCreateRequest(
  source: TransformSource,
  {
    name,
    targetName,
    targetSchema,
    incremental,
    checkpointFilter,
    checkpointFilterUniqueKey,
    sourceStrategy,
    targetStrategy,
  }: NewTransformValues,
  databaseId: number,
): CreateTransformRequest {
  // Build the source with incremental strategy if enabled
  let transformSource: TransformSource;
  if (incremental) {
    // For native queries, use checkpoint-filter (plain string)
    // For MBQL/Python queries, use checkpoint-filter-unique-key (prefixed format)
    const strategyFields = checkpointFilter
      ? { "checkpoint-filter": checkpointFilter }
      : checkpointFilterUniqueKey
        ? { "checkpoint-filter-unique-key": checkpointFilterUniqueKey }
        : {};

    transformSource = {
      ...source,
      "source-incremental-strategy": {
        type: sourceStrategy,
        ...strategyFields,
      },
    };
  } else {
    transformSource = source;
  }

  // Build the target with incremental strategy if enabled
  const transformTarget: CreateTransformRequest["target"] = incremental
    ? {
        type: "table-incremental",
        name: targetName,
        schema: targetSchema,
        database: databaseId,
        "target-incremental-strategy": {
          type: targetStrategy,
        },
      }
    : {
        type: "table",
        name: targetName,
        schema: targetSchema ?? null,
        database: databaseId,
      };

  return {
    name,
    source: transformSource,
    target: transformTarget,
  };
}
