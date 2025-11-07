import { useFormikContext } from "formik";
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
  FormSelect,
  FormSubmitButton,
  FormSwitch,
  FormTextInput,
  FormTextarea,
} from "metabase/forms";
import * as Errors from "metabase/lib/errors";
import { useSelector } from "metabase/lib/redux";
import { getMetadata } from "metabase/selectors/metadata";
import {
  Alert,
  Box,
  Button,
  FocusTrap,
  Group,
  Modal,
  Stack,
} from "metabase/ui";
import { useCreateTransformMutation } from "metabase-enterprise/api";
import { trackTransformCreated } from "metabase-enterprise/transforms/analytics";
import {
  KeysetColumnSelect,
  PythonKeysetColumnSelect,
} from "metabase-enterprise/transforms/components/KeysetColumnSelect";
import { SchemaFormSelect } from "metabase-enterprise/transforms/components/SchemaFormSelect";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import type {
  CreateTransformRequest,
  SuggestedTransform,
  Transform,
  TransformSource,
} from "metabase-types/api";

function getValidationSchema(source: TransformSource) {
  const isPythonTransform =
    source.type === "python" &&
    source["source-tables"] &&
    Object.keys(source["source-tables"]).length === 1;

  return Yup.object({
    name: Yup.string().required(Errors.required),
    description: Yup.string().nullable(),
    targetName: Yup.string().required(Errors.required),
    targetSchema: Yup.string().nullable().defined(),
    incremental: Yup.boolean().required(),
    keysetFilterUniqueKey: Yup.string()
      .nullable()
      .when("incremental", {
        is: true,
        then: (schema) => schema.required(Errors.required),
        otherwise: (schema) => schema.nullable(),
      }),
    sourceStrategy: Yup.mixed<"keyset">().oneOf(["keyset"]).required(),
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

type SourceStrategyFieldsProps = {
  source: TransformSource;
};

function SourceStrategyFields({ source }: SourceStrategyFieldsProps) {
  const { values } = useFormikContext<NewTransformValues>();
  const metadata = useSelector(getMetadata);

  // Convert DatasetQuery to Lib.Query via Question
  const libQuery = useMemo(() => {
    if (source.type !== "query") {
      return null;
    }

    try {
      const question = Question.create({
        dataset_query: source.query,
        metadata,
      });
      return question.query();
    } catch (error) {
      console.error("SourceStrategyFields: Error creating question", error);
      return null;
    }
  }, [source, metadata]);

  // Check if this is an MBQL query (not native SQL or Python)
  const isMbqlQuery = useMemo(() => {
    if (!libQuery) {
      return false;
    }

    try {
      const queryDisplayInfo = Lib.queryDisplayInfo(libQuery);
      return !queryDisplayInfo.isNative;
    } catch (error) {
      console.error("SourceStrategyFields: Error checking query type", error);
      return false;
    }
  }, [libQuery]);

  // Check if this is a Python transform with exactly one source table
  // Incremental transforms are only supported for single-table Python transforms
  const isPythonTransform =
    source.type === "python" &&
    source["source-tables"] &&
    Object.keys(source["source-tables"]).length === 1;

  if (!values.incremental) {
    return null;
  }

  return (
    <>
      <FormSelect
        name="sourceStrategy"
        label={t`Source Strategy`}
        description={t`How to track which rows to process`}
        data={[{ value: "keyset", label: t`Keyset` }]}
      />
      {values.sourceStrategy === "keyset" && (
        <>
          {isMbqlQuery && libQuery && (
            <KeysetColumnSelect
              name="keysetFilterUniqueKey"
              label={t`Source Filter Field`}
              placeholder={t`Select a field to filter on`}
              description={t`Which field from the source to use in the incremental filter`}
              query={libQuery}
            />
          )}
          {isPythonTransform && source["source-tables"] && (
            <PythonKeysetColumnSelect
              name="keysetFilterUniqueKey"
              label={t`Source Filter Field`}
              placeholder={t`Select a field to filter on`}
              description={t`Which field from the source to use in the incremental filter`}
              sourceTables={source["source-tables"]}
            />
          )}
        </>
      )}
    </>
  );
}

function TargetStrategyFields() {
  const { values } = useFormikContext<NewTransformValues>();

  if (!values.incremental) {
    return null;
  }

  return (
    <>
      <FormSelect
        name="targetStrategy"
        label={t`Target Strategy`}
        description={t`How to update the target table`}
        data={[{ value: "append", label: t`Append` }]}
      />
      {/* Append strategy has no additional fields */}
      {/* Future strategies like "merge" could add fields here */}
    </>
  );
}

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

  const validationSchema = useMemo(() => getValidationSchema(source), [source]);

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
        <Stack gap="lg">
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
          <FormSwitch name="incremental" label={t`Incremental?`} />
          <SourceStrategyFields source={source} />
          <TargetStrategyFields />
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
    keysetFilterUniqueKey: null,
    sourceStrategy: "keyset",
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
    keysetFilterUniqueKey,
    sourceStrategy,
    targetStrategy,
  }: NewTransformValues,
  databaseId: number,
): CreateTransformRequest {
  // Build the source with incremental strategy if enabled
  const transformSource: TransformSource = incremental
    ? {
        ...source,
        "source-incremental-strategy": {
          type: sourceStrategy,
          "keyset-filter-unique-key": keysetFilterUniqueKey!,
        },
      }
    : source;

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
