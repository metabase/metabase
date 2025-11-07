import { useMemo } from "react";
import { t } from "ttag";
import * as Yup from "yup";

import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSelect,
  FormSubmitButton,
  FormSwitch,
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
  sourceStrategy: "checkpoint";
  checkpointFilter: string | null;
  checkpointFilterUniqueKey: string | null;
  targetStrategy: "append";
};

function getValidationSchema(transform: Transform) {
  const isPythonTransform =
    transform.source.type === "python" &&
    transform.source["source-tables"] &&
    Object.keys(transform.source["source-tables"]).length === 1;

  return Yup.object({
    incremental: Yup.boolean().required(),
    sourceStrategy: Yup.string().oneOf(["checkpoint"]).required(),
    // For native queries, use checkpointFilter (plain string)
    checkpointFilter: Yup.string().nullable(),
    // For MBQL/Python queries, use checkpointFilterUniqueKey (prefixed format)
    checkpointFilterUniqueKey: Yup.string().nullable(),
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
    let source;
    if (values.incremental) {
      // For native queries, use checkpoint-filter (plain string)
      // For MBQL/Python queries, use checkpoint-filter-unique-key (prefixed format)
      const strategyFields = values.checkpointFilter
        ? { "checkpoint-filter": values.checkpointFilter }
        : values.checkpointFilterUniqueKey
        ? { "checkpoint-filter-unique-key": values.checkpointFilterUniqueKey }
        : {};

      source = {
        ...transform.source,
        "source-incremental-strategy": {
          type: "checkpoint" as const,
          ...strategyFields,
        },
      };
    } else {
      source = {
        ...transform.source,
        "source-incremental-strategy": undefined,
      };
    }

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
            <FormSwitch
              name="incremental"
              label={t`Make this transform incremental`}
              description={t`Incremental transforms only process new or changed data`}
            />
            {values.incremental && (
              <>
                <FormSelect
                  name="sourceStrategy"
                  label={t`Source Strategy`}
                  description={t`How to track which rows to process`}
                  data={[{ value: "checkpoint", label: t`Checkpoint` }]}
                />
                {values.sourceStrategy === "checkpoint" && (
                  <>
                    {isMbqlQuery && libQuery && (
                      <KeysetColumnSelect
                        name="checkpointFilterUniqueKey"
                        label={t`Source Filter Field`}
                        placeholder={t`Select a field to filter on`}
                        description={t`Which field from the source to use in the incremental filter`}
                        query={libQuery}
                      />
                    )}
                    {!isMbqlQuery && libQuery && (
                        <FormTextInput
                        name="checkpointFilter"
                        label={t`Source Filter Field`}
                        placeholder={t`e.g., id, updated_at`}
                        description={t`Column name to use in the incremental filter`}
                        />
                    )}
                    {isPythonTransform &&
                      transform.source.type === "python" &&
                      transform.source["source-tables"] && (
                        <PythonKeysetColumnSelect
                          name="checkpointFilterUniqueKey"
                          label={t`Source Filter Field`}
                          placeholder={t`Select a field to filter on`}
                          description={t`Which field from the source to use in the incremental filter`}
                          sourceTables={transform.source["source-tables"]}
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

  // Read both fields from the strategy, whichever is present
  const checkpointFilter =
    strategy?.type === "checkpoint"
      ? strategy["checkpoint-filter"] ?? null
      : null;

  const checkpointFilterUniqueKey =
    strategy?.type === "checkpoint"
      ? strategy["checkpoint-filter-unique-key"] ?? null
      : null;

  return {
    incremental: isIncremental,
    sourceStrategy: "checkpoint",
    checkpointFilter: isIncremental ? checkpointFilter : null,
    checkpointFilterUniqueKey: isIncremental ? checkpointFilterUniqueKey : null,
    targetStrategy: "append",
  };
}
