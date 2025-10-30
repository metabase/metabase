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
    keysetColumn: Yup.string()
      .nullable()
      .when("incremental", {
        is: true,
        then: (schema) => schema.required(Errors.required),
        otherwise: (schema) => schema.nullable(),
      }),
    keysetFilterUniqueKey: Yup.string().nullable(),
    queryLimit: Yup.number()
      .nullable()
      .positive(t`Query limit must be a positive number`)
      .integer(t`Query limit must be an integer`)
      .when("incremental", {
        is: true,
        then: (schema) =>
          isPythonTransform
            ? schema.required(t`Query limit is required for Python transforms`)
            : schema.nullable(),
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
  initValues?: Partial<NewTransformValues>;
  onCreate: (transform: Transform) => void;
  onClose: () => void;
  initialIncremental?: boolean;
};

export function CreateTransformModal({
  source,
  initValues,
  onCreate,
  onClose,
  initialIncremental = false,
}: CreateTransformModalProps) {
  return (
    <Modal title={t`Save your transform`} opened padding="xl" onClose={onClose}>
      <FocusTrap.InitialFocus />
      <CreateTransformForm
        source={source}
        initValues={initValues}
        onCreate={onCreate}
        onClose={onClose}
        initialIncremental={initialIncremental}
      />
    </Modal>
  );
}

type CreateTransformFormProps = {
  source: TransformSource;
  initValues?: Partial<NewTransformValues>;
  onCreate: (transform: Transform) => void;
  onClose: () => void;
  initialIncremental: boolean;
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
          <FormTextInput
            name="keysetColumn"
            label={t`Keyset Column`}
            placeholder={t`e.g., id, updated_at`}
            description={t`Column name in the target table to track progress`}
          />
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
          {
            <FormTextInput
              name="queryLimit"
              label={t`Query Limit`}
              placeholder={t`e.g., 1000`}
              description={t`Maximum number of rows to fetch from the source table per run`}
              type="number"
            />
          }
        </>
      )}
    </>
  );
}

type IncrementalNoticeProps = {
  source: TransformSource;
};

function IncrementalNotice({ source }: IncrementalNoticeProps) {
  const { values } = useFormikContext<NewTransformValues>();

  if (!values.incremental) {
    return null;
  }

  // Only show the note for SQL/native queries
  // MBQL queries will have the filter automatically added
  if (source.type !== "query") {
    return null;
  }

  // Check if this is a native query by looking at the stages
  const query = source.query as any;
  const isNativeQuery =
    query.stages?.[0]?.["lib/type"] === "mbql.stage/native" ||
    query.stages?.[0]?.native != null;

  if (!isNativeQuery) {
    return null;
  }

  return (
    <Alert variant="info" icon="info">
      {t`Ensure your query contains WHERE filter on the keyset column (and potentially a LIMIT). You may want to use:`}{" "}
      <strong>{`[[AND id > {{watermark}}]] [[LIMIT {{limit}}]]`}</strong>
    </Alert>
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
  initValues,
  onCreate,
  onClose,
  initialIncremental,
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
    () => getInitialValues(schemas, initialIncremental, initValues),
    [schemas, initialIncremental, initValues],
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
          <IncrementalNotice source={source} />
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
  initialIncremental: boolean,
  initValues?: Partial<NewTransformValues>,
): NewTransformValues {
  return {
    name: "",
    description: null,
    targetName: "",
    targetSchema: schemas?.[0] || null,
    incremental: initialIncremental,
    keysetColumn: initialIncremental ? "id" : null,
    keysetFilterUniqueKey: null,
    queryLimit: null,
    sourceStrategy: "keyset",
    targetStrategy: "append",
    ...initValues,
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
    keysetColumn,
    keysetFilterUniqueKey,
    queryLimit,
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
          "keyset-column": keysetColumn!,
          ...(keysetFilterUniqueKey && {
            "keyset-filter-unique-key": keysetFilterUniqueKey,
          }),
          ...(queryLimit != null && {
            "query-limit": queryLimit,
          }),
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
