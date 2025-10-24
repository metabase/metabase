import { useMemo } from "react";
import { t } from "ttag";
import * as Yup from "yup";

import {
  Form,
  FormCheckbox,
  FormErrorMessage,
  FormProvider,
  FormSelect,
  FormSubmitButton,
  FormTextInput,
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
import { useUpdateTransformMutation } from "metabase-enterprise/api";
import {
  KeysetColumnSelect,
  PythonKeysetColumnSelect,
} from "metabase-enterprise/transforms/components/KeysetColumnSelect";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import type { Transform } from "metabase-types/api";

type UpdateIncrementalModalProps = {
  transform: Transform;
  onUpdate: () => void;
  onClose: () => void;
};

export function UpdateIncrementalModal({
  transform,
  onUpdate,
  onClose,
}: UpdateIncrementalModalProps) {
  return (
    <Modal
      title={t`Configure incremental settings`}
      opened
      padding="xl"
      onClose={onClose}
    >
      <FocusTrap.InitialFocus />
      <UpdateIncrementalForm
        transform={transform}
        onUpdate={onUpdate}
        onClose={onClose}
      />
    </Modal>
  );
}

type IncrementalValues = {
  incremental: boolean;
  sourceStrategy: "keyset";
  keysetColumn: string | null;
  keysetFilterUniqueKey: string | null;
  queryLimit: number | null;
  targetStrategy: "append";
};

function getValidationSchema(transform: Transform) {
  const isPythonTransform =
    transform.source.type === "python" &&
    transform.source["source-tables"] &&
    Object.keys(transform.source["source-tables"]).length === 1;

  return Yup.object({
    incremental: Yup.boolean().required(),
    sourceStrategy: Yup.string().oneOf(["keyset"]).required(),
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
    targetStrategy: Yup.string().oneOf(["append"]).required(),
  });
}

type UpdateIncrementalFormProps = {
  transform: Transform;
  onUpdate: () => void;
  onClose: () => void;
};

function UpdateIncrementalForm({
  transform,
  onUpdate,
  onClose,
}: UpdateIncrementalFormProps) {
  const [updateTransform] = useUpdateTransformMutation();
  const metadata = useSelector(getMetadata);
  const initialValues = useMemo(() => getInitialValues(transform), [transform]);
  const validationSchema = useMemo(
    () => getValidationSchema(transform),
    [transform],
  );

  // Convert DatasetQuery to Lib.Query via Question
  const libQuery = useMemo(() => {
    if (transform.source.type !== "query") {
      return null;
    }

    try {
      const question = Question.create({
        dataset_query: transform.source.query,
        metadata,
      });
      return question.query();
    } catch (error) {
      console.error("UpdateIncrementalForm: Error creating question", error);
      return null;
    }
  }, [transform.source, metadata]);

  // Check if this is an MBQL query (not native SQL or Python)
  const isMbqlQuery = useMemo(() => {
    if (!libQuery) {
      return false;
    }

    try {
      const queryDisplayInfo = Lib.queryDisplayInfo(libQuery);
      return !queryDisplayInfo.isNative;
    } catch (error) {
      console.error("UpdateIncrementalForm: Error checking query type", error);
      return false;
    }
  }, [libQuery]);

  // Check if this is a Python transform with exactly one source table
  // Incremental transforms are only supported for single-table Python transforms
  const isPythonTransform = useMemo(() => {
    return (
      transform.source.type === "python" &&
      transform.source["source-tables"] &&
      Object.keys(transform.source["source-tables"]).length === 1
    );
  }, [transform.source]);

  const handleSubmit = async (values: IncrementalValues) => {
    // Build the source with incremental strategy if enabled
    const source = values.incremental
      ? {
          ...transform.source,
          "source-incremental-strategy": {
            type: "keyset" as const,
            "keyset-column": values.keysetColumn!,
            ...(values.keysetFilterUniqueKey && {
              "keyset-filter-unique-key": values.keysetFilterUniqueKey,
            }),
            ...(values.queryLimit != null && {
              "query-limit": values.queryLimit,
            }),
          },
        }
      : {
          ...transform.source,
          "source-incremental-strategy": undefined,
        };

    // Build the target with incremental strategy if enabled
    const target = values.incremental
      ? {
          type: "table-incremental" as const,
          name: transform.target.name,
          schema: transform.target.schema,
          database: transform.target.database,
          "target-incremental-strategy": {
            type: values.targetStrategy,
          },
        }
      : {
          type: "table" as const,
          name: transform.target.name,
          schema: transform.target.schema,
          database: transform.target.database,
        };

    await updateTransform({
      id: transform.id,
      source,
      target,
    }).unwrap();

    onUpdate();
  };

  return (
    <FormProvider
      initialValues={initialValues}
      validationSchema={validationSchema}
      onSubmit={handleSubmit}
    >
      {({ values }) => (
        <Form>
          <Stack gap="lg">
            <FormCheckbox
              name="incremental"
              label={t`Make this transform incremental`}
              description={t`Incremental transforms only process new or changed data`}
            />
            {values.incremental && (
              <>
                {(() => {
                  // Check if this is a native query
                  if (transform.source.type !== "query") {
                    return null;
                  }
                  const query = transform.source.query as any;
                  const isNativeQuery =
                    query.stages?.[0]?.["lib/type"] === "mbql.stage/native" ||
                    query.stages?.[0]?.native != null;

                  return isNativeQuery ? (
                    <Alert variant="info" icon="info">
                          {t`Ensure your query contains WHERE filter on the keyset column (and potentially a LIMIT). You may want to use:`}{" "}
                          <strong>{`[[AND id > {{watermark}}]] [[LIMIT {{limit}}]]`}</strong>
                    </Alert>
                  ) : null;
                })()}
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
                    {isPythonTransform &&
                      transform.source.type === "python" &&
                      transform.source["source-tables"] && (
                        <PythonKeysetColumnSelect
                          name="keysetFilterUniqueKey"
                          label={t`Source Filter Field`}
                          placeholder={t`Select a field to filter on`}
                          description={t`Which field from the source to use in the incremental filter`}
                          sourceTables={transform.source["source-tables"]}
                        />
                      )}
                    {(
                      <FormTextInput
                        name="queryLimit"
                        label={t`Query Limit`}
                        placeholder={t`e.g., 1000`}
                        description={t`Maximum number of rows to fetch from the source table per run`}
                        type="number"
                      />
                    )}
                  </>
                )}
                <FormSelect
                  name="targetStrategy"
                  label={t`Target Strategy`}
                  description={t`How to update the target table`}
                  data={[{ value: "append", label: t`Append` }]}
                />
              </>
            )}
            <Group>
              <Box flex={1}>
                <FormErrorMessage />
              </Box>
              <Button variant="subtle" onClick={onClose}>{t`Cancel`}</Button>
              <FormSubmitButton label={t`Save`} variant="filled" />
            </Group>
          </Stack>
        </Form>
      )}
    </FormProvider>
  );
}

function getInitialValues(transform: Transform): IncrementalValues {
  const isIncremental = transform.target.type === "table-incremental";
  const strategy = transform.source["source-incremental-strategy"];
  const columnName =
    strategy?.type === "keyset" ? strategy["keyset-column"] : null;
  const filterUniqueKey =
    strategy?.type === "keyset" && strategy["keyset-filter-unique-key"]
      ? strategy["keyset-filter-unique-key"]
      : null;
  const queryLimit =
    strategy?.type === "keyset" && strategy["query-limit"]
      ? strategy["query-limit"]
      : null;

  return {
    incremental: isIncremental,
    sourceStrategy: "keyset",
    keysetColumn: isIncremental ? columnName : null,
    keysetFilterUniqueKey: isIncremental ? filterUniqueKey : null,
    queryLimit: isIncremental ? queryLimit : null,
    targetStrategy: "append",
  };
}
