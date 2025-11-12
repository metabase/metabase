import { useMemo } from "react";
import { t } from "ttag";
import * as Yup from "yup";

import { hasFeature } from "metabase/admin/databases/utils";
import {
  skipToken,
  useGetDatabaseQuery,
  useListDatabaseSchemasQuery,
} from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSubmitButton,
  FormTextInput,
  FormTextarea,
} from "metabase/forms";
import * as Errors from "metabase/lib/errors";
import { Box, Button, FocusTrap, Group, Modal, Stack } from "metabase/ui";
import { useCreateTransformMutation } from "metabase-enterprise/api";
import { trackTransformCreated } from "metabase-enterprise/transforms/analytics";
import { SchemaFormSelect } from "metabase-enterprise/transforms/components/SchemaFormSelect";
import type {
  CreateTransformRequest,
  SuggestedTransform,
  Transform,
  TransformSource,
} from "metabase-types/api";

import { IncrementalTransformSettings } from "./IncrementalTransformSettings";

function getValidationSchema() {
  return Yup.object({
    name: Yup.string().required(Errors.required),
    description: Yup.string().nullable(),
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

type CreateTransformModalProps = {
  source: TransformSource;
  suggestedTransform: SuggestedTransform | undefined;
  onCreate: (transform: Transform) => void;
  onClose: () => void;
};

export function CreateTransformModal({
  source,
  suggestedTransform,
  onCreate,
  onClose,
}: CreateTransformModalProps) {
  return (
    <Modal title={t`Save your transform`} opened padding="xl" onClose={onClose}>
      <FocusTrap.InitialFocus />
      <CreateTransformForm
        source={source}
        suggestedTransform={suggestedTransform}
        onCreate={onCreate}
        onClose={onClose}
      />
    </Modal>
  );
}

type CreateTransformFormProps = {
  source: TransformSource;
  suggestedTransform: SuggestedTransform | undefined;
  onCreate: (transform: Transform) => void;
  onClose: () => void;
};

function CreateTransformForm({
  source,
  suggestedTransform,
  onCreate,
  onClose,
}: CreateTransformFormProps) {
  const databaseId =
    source.type === "query" ? source.query.database : source["source-database"];

  const {
    data: database,
    isLoading: isDatabaseLoading,
    error: databaseError,
  } = useGetDatabaseQuery(databaseId ? { id: databaseId } : skipToken);

  const {
    data: schemas = [],
    isLoading: isSchemasLoading,
    error: schemasError,
  } = useListDatabaseSchemasQuery(
    databaseId ? { id: databaseId, include_hidden: true } : skipToken,
  );

  const isLoading = isDatabaseLoading || isSchemasLoading;
  const error = databaseError ?? schemasError;

  const [createTransform] = useCreateTransformMutation();
  const supportsSchemas = database && hasFeature(database, "schemas");

  const initialValues: NewTransformValues = useMemo(
    () => getInitialValues(schemas, suggestedTransform),
    [schemas, suggestedTransform],
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
    const transform = await createTransform(request).unwrap();

    trackTransformCreated({ transformId: transform.id });

    onCreate(transform);
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
          />
          <FormTextarea
            name="description"
            label={t`Description`}
            placeholder={t`This is optional, but helpful`}
            minRows={4}
            maxRows={10}
          />
          {supportsSchemas && (
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
          <IncrementalTransformSettings source={source} />
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
  schemas: string[],
  suggestedTransform: SuggestedTransform | undefined,
): NewTransformValues {
  return {
    name: "",
    description: suggestedTransform ? suggestedTransform.description : null,
    targetName: suggestedTransform ? suggestedTransform.target.name : "",
    targetSchema: suggestedTransform
      ? suggestedTransform.target.schema
      : schemas?.[0] || null,
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
    description,
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
        schema: targetSchema,
        database: databaseId,
      };

  return {
    name,
    description,
    source: transformSource,
    target: transformTarget,
  };
}
