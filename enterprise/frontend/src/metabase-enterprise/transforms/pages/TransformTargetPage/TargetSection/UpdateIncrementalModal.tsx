import { useMemo } from "react";
import { t } from "ttag";
import * as Yup from "yup";

import { getErrorMessage } from "metabase/api/utils";
import { useToast } from "metabase/common/hooks";
import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSubmitButton,
} from "metabase/forms";
import { Box, Button, FocusTrap, Group, Modal, Stack } from "metabase/ui";
import { useUpdateTransformMutation } from "metabase-enterprise/api";
import { IncrementalTransformSettings } from "metabase-enterprise/transforms/components/IncrementalTransform/IncrementalTransformSettings";
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

function getValidationSchema() {
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
  const [sendToast] = useToast();
  const [updateTransform] = useUpdateTransformMutation();
  const initialValues = useMemo(() => getInitialValues(transform), [transform]);
  const validationSchema = useMemo(() => getValidationSchema(), []);

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

    try {
      await updateTransform({
        id: transform.id,
        source,
        target,
      }).unwrap();

      onUpdate();
    } catch (error) {
      sendToast({
        message: getErrorMessage(error, t`Failed to update transform`),
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
          <IncrementalTransformSettings
            source={transform.source}
            checkOnMount
          />
          <Group>
            <Box flex={1}>
              <FormErrorMessage />
            </Box>
            <Button variant="subtle" onClick={onClose}>{t`Cancel`}</Button>
            <FormSubmitButton label={t`Save`} variant="filled" />
          </Group>
        </Stack>
      </Form>
    </FormProvider>
  );
}

function getInitialValues(transform: Transform): IncrementalValues {
  const isIncremental = transform.target.type === "table-incremental";
  const strategy = transform.source["source-incremental-strategy"];

  // Read both fields from the strategy, whichever is present
  const checkpointFilter =
    strategy?.type === "checkpoint"
      ? (strategy["checkpoint-filter"] ?? null)
      : null;

  const checkpointFilterUniqueKey =
    strategy?.type === "checkpoint"
      ? (strategy["checkpoint-filter-unique-key"] ?? null)
      : null;

  return {
    incremental: isIncremental,
    sourceStrategy: "checkpoint",
    checkpointFilter: isIncremental ? checkpointFilter : null,
    checkpointFilterUniqueKey: isIncremental ? checkpointFilterUniqueKey : null,
    targetStrategy: "append",
  };
}
