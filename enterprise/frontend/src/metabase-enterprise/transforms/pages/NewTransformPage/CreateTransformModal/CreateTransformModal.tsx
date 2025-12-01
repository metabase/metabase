import { useField } from "formik";
import { useEffect, useMemo, useState } from "react";
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
import { useDebouncedValue } from "metabase/common/hooks/use-debounced-value";
import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSubmitButton,
  FormTextInput,
} from "metabase/forms";
import * as Errors from "metabase/lib/errors";
import {
  Box,
  Button,
  Group,
  Loader,
  Modal,
  Stack,
  TextInput,
} from "metabase/ui";
import { useCreateTransformMutation } from "metabase-enterprise/api";
import { IncrementalTransformSettings } from "metabase-enterprise/transforms/components/IncrementalTransform/IncrementalTransformSettings";
import type {
  CreateTransformRequest,
  Transform,
  TransformSource,
} from "metabase-types/api";

import { trackTransformCreated } from "../../../analytics";

import { SchemaFormSelect } from "./../../../components/SchemaFormSelect";

function getValidationSchema() {
  return Yup.object({
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
}

export type NewTransformValues = Yup.InferType<
  ReturnType<typeof getValidationSchema>
>;

export type ValidateTableNameFn = (
  tableName: string,
  schema: string | null,
) => Promise<{ valid: boolean; error?: string }>;

type CreateTransformModalProps = {
  source: TransformSource;
  defaultValues: Partial<NewTransformValues>;
  onCreate: (transform: Transform) => void;
  onClose: () => void;
  schemas?: string[] | null;
  showIncrementalSettings?: boolean;
  validateTableName?: ValidateTableNameFn;
};

export function CreateTransformModal({
  source,
  defaultValues,
  onCreate,
  onClose,
  schemas,
  showIncrementalSettings = true,
  validateTableName,
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
        validateTableName={validateTableName}
      />
    </Modal>
  );
}

type CreateTransformFormProps = {
  source: TransformSource;
  defaultValues: Partial<NewTransformValues>;
  onCreate: (transform: Transform) => void;
  onClose: () => void;
  schemas?: string[] | null;
  showIncrementalSettings?: boolean;
  validateTableName?: ValidateTableNameFn;
};

function CreateTransformForm({
  source,
  defaultValues,
  onCreate,
  onClose,
  schemas: schemasProp,
  showIncrementalSettings = true,
  validateTableName,
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

  const validationSchema = useMemo(() => getValidationSchema(), []);

  if (isLoading || error != null) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  const handleSubmit = async (values: NewTransformValues) => {
    if (!databaseId) {
      throw new Error("Database ID is required");
    }
    const request = getCreateRequest(source, values, databaseId);
    try {
      const transform = await createTransform(request).unwrap();
      trackTransformCreated({ transformId: transform.id });
      onCreate(transform);
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
      onSubmit={handleSubmit}
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
          {validateTableName ? (
            <AsyncValidatedTableNameInput
              validateTableName={validateTableName}
            />
          ) : (
            <FormTextInput
              name="targetName"
              label={t`Table name`}
              placeholder={t`descriptive_name`}
            />
          )}
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

const DEBOUNCE_DELAY = 300;

type AsyncValidatedTableNameInputProps = {
  validateTableName: ValidateTableNameFn;
};

function AsyncValidatedTableNameInput({
  validateTableName,
}: AsyncValidatedTableNameInputProps) {
  const [{ value }, { error, touched }, { setValue, setTouched, setError }] =
    useField("targetName");
  const [{ value: schemaValue }] = useField("targetSchema");
  const [isValidating, setIsValidating] = useState(false);
  const debouncedValue = useDebouncedValue(value, DEBOUNCE_DELAY);
  const debouncedSchema = useDebouncedValue(schemaValue, DEBOUNCE_DELAY);

  useEffect(() => {
    if (!debouncedValue) {
      return;
    }

    let cancelled = false;
    setIsValidating(true);

    validateTableName(debouncedValue, debouncedSchema)
      .then((result) => {
        if (cancelled) {
          return;
        }
        if (!result.valid && result.error) {
          setError(result.error);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError(t`The "${debouncedValue}" table name is already taken.`);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsValidating(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedValue, debouncedSchema, validateTableName, setError]);

  return (
    <TextInput
      name="targetName"
      label={t`Table name`}
      placeholder={t`descriptive_name`}
      value={value ?? ""}
      error={touched && error ? error : null}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => setTouched(true)}
      rightSection={isValidating ? <Loader size="xs" /> : null}
    />
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
