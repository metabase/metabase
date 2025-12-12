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
import { FormTransformCollectionPicker } from "metabase-enterprise/transforms/components/TransformCollectionPicker";
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
    collection_id: Yup.number().nullable().defined(),
    incremental: Yup.boolean().required(),
    checkpointFilter: Yup.string().nullable(),
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
  defaultValues: Partial<NewTransformValues>;
  onCreate: (transform: Transform) => void;
  onClose: () => void;
};

export function CreateTransformModal({
  source,
  defaultValues,
  onCreate,
  onClose,
}: CreateTransformModalProps) {
  return (
    <Modal title={t`Save your transform`} opened padding="xl" onClose={onClose}>
      <CreateTransformForm
        source={source}
        defaultValues={defaultValues}
        onCreate={onCreate}
        onClose={onClose}
      />
    </Modal>
  );
}

type CreateTransformFormProps = {
  source: TransformSource;
  defaultValues: Partial<NewTransformValues>;
  onCreate: (transform: Transform) => void;
  onClose: () => void;
};

function CreateTransformForm({
  source,
  defaultValues,
  onCreate,
  onClose,
}: CreateTransformFormProps) {
  const [sendToast] = useToast();
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
          <FormTransformCollectionPicker name="collection_id" />
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
  defaultValues: Partial<NewTransformValues>,
): NewTransformValues {
  return {
    name: "",
    targetName: "",
    targetSchema: schemas?.[0] || null,
    collection_id: null,
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
    collection_id,
    incremental,
    checkpointFilter,
    checkpointFilterUniqueKey,
    sourceStrategy,
    targetStrategy,
  }: NewTransformValues,
  databaseId: number,
): CreateTransformRequest {
  let transformSource: TransformSource;
  if (incremental) {
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
    collection_id: collection_id ?? null,
  };
}
