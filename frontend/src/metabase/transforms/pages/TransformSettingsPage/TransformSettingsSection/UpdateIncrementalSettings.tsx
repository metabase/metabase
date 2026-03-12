import { useDebouncedCallback, useDisclosure } from "@mantine/hooks";
import { useFormikContext } from "formik";
import { useCallback, useRef } from "react";
import { t } from "ttag";
import _ from "underscore";

import {
  skipToken,
  useGetFieldQuery,
  useResetCheckpointMutation,
} from "metabase/api";
import { ConfirmModal } from "metabase/common/components/ConfirmModal";
import { Form, FormObserver, FormProvider } from "metabase/forms";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { CheckpointValue } from "metabase/transforms/components/CheckpointValue";
import type { IncrementalSettingsFormValues } from "metabase/transforms/components/IncrementalTransform";
import {
  IncrementalTransformSettings,
  useUpdateIncrementalSettings,
} from "metabase/transforms/components/IncrementalTransform";
import { isTransformRunning } from "metabase/transforms/utils";
import { Box, Button, Group, Icon, Text } from "metabase/ui";
import type { Transform } from "metabase-types/api";

type UpdateIncrementalSettingsProps = {
  transform: Transform;
  readOnly?: boolean;
};

function ResetCheckpointSection({ transform }: { transform: Transform }) {
  const [isModalOpen, { open: openModal, close: closeModal }] = useDisclosure();
  const { sendSuccessToast, sendErrorToast } = useMetadataToasts();
  const [resetCheckpoint, { isLoading }] = useResetCheckpointMutation();

  const checkpointFieldId =
    transform.source?.["source-incremental-strategy"]?.[
      "checkpoint-filter-field-id"
    ];
  const { data: checkpointField } = useGetFieldQuery(
    checkpointFieldId ? { id: checkpointFieldId } : skipToken,
  );

  const handleConfirm = async () => {
    const { error } = await resetCheckpoint(transform.id);
    closeModal();
    if (error) {
      sendErrorToast(t`Failed to reset checkpoint`);
    } else {
      sendSuccessToast(t`Checkpoint has been reset`);
    }
  };

  if (transform.last_checkpoint_value == null) {
    return null;
  }

  return (
    <Group gap="md" align="center">
      <Box c="text-secondary" fz="sm">
        {t`Current checkpoint`}:{" "}
        <Text component="span" fw="bold" c="text-primary">
          <CheckpointValue
            value={transform.last_checkpoint_value}
            baseType={checkpointField?.base_type}
          />
        </Text>
      </Box>
      <Button
        leftSection={<Icon name="revert" aria-hidden />}
        disabled={isTransformRunning(transform) || isLoading}
        onClick={openModal}
      >
        {t`Reset checkpoint`}
      </Button>
      <ConfirmModal
        title={t`Reset checkpoint?`}
        message={t`This will cause the next run to reprocess all data from scratch instead of only new rows.`}
        opened={isModalOpen}
        onClose={closeModal}
        onConfirm={handleConfirm}
      />
    </Group>
  );
}

const IncrementalTransformSettingsWrapper = ({
  transform,
  readOnly,
}: UpdateIncrementalSettingsProps) => {
  const { values, setFieldValue } =
    useFormikContext<IncrementalSettingsFormValues>();

  const handleIncrementalChange = (value: boolean) => {
    setFieldValue("incremental", value);
  };

  return (
    <IncrementalTransformSettings
      source={transform.source}
      incremental={values.incremental}
      onIncrementalChange={handleIncrementalChange}
      variant="standalone"
      readOnly={readOnly}
      extraActions={
        !readOnly && transform.last_checkpoint_value != null ? (
          <ResetCheckpointSection transform={transform} />
        ) : undefined
      }
    />
  );
};

/**
 * A form observer that auto-saves on change, but intercepts checkpoint field
 * changes to show a confirmation modal when a checkpoint value already exists.
 */
function ConfirmableInlineUpdater({
  transform,
  update,
}: {
  transform: Transform;
  update: (values: IncrementalSettingsFormValues) => Promise<unknown>;
}) {
  const { sendSuccessToast, sendErrorToast } = useMetadataToasts();
  const { initialValues, resetForm } =
    useFormikContext<IncrementalSettingsFormValues>();
  const [isModalOpen, { open: openModal, close: closeModal }] = useDisclosure();
  const pendingValues = useRef<IncrementalSettingsFormValues | null>(null);
  const updateInProgress = useRef(false);

  const currentFieldId =
    transform.source?.["source-incremental-strategy"]?.[
      "checkpoint-filter-field-id"
    ];

  const processUpdate = useCallback(
    async (values: IncrementalSettingsFormValues) => {
      if (updateInProgress.current) {
        return;
      }
      updateInProgress.current = true;
      try {
        await update(values);
        sendSuccessToast(t`Incremental transformation settings updated`);
      } catch {
        sendErrorToast(t`Failed to update incremental transformation settings`);
      } finally {
        updateInProgress.current = false;
      }
    },
    [update, sendSuccessToast, sendErrorToast],
  );

  const handleChange = useDebouncedCallback(
    (values: IncrementalSettingsFormValues) => {
      if (_.isEqual(values, initialValues)) {
        return;
      }

      const waitingForCheckpointSelection =
        values.incremental &&
        values.sourceStrategy === "checkpoint" &&
        values.checkpointFilterFieldId == null;

      if (waitingForCheckpointSelection) {
        return;
      }

      const fieldChanged =
        currentFieldId != null &&
        values.checkpointFilterFieldId != null &&
        String(currentFieldId) !== values.checkpointFilterFieldId;

      if (fieldChanged && transform.last_checkpoint_value != null) {
        pendingValues.current = values;
        openModal();
        return;
      }

      processUpdate(values);
    },
    300,
  );

  const handleConfirm = async () => {
    if (pendingValues.current == null) {
      return;
    }
    const values = pendingValues.current;
    pendingValues.current = null;
    closeModal();
    await processUpdate(values);
  };

  const handleCancel = () => {
    pendingValues.current = null;
    closeModal();
    resetForm();
  };

  return (
    <>
      <FormObserver onChange={handleChange} skipInitialCall />
      <ConfirmModal
        title={t`Change checkpoint field?`}
        message={t`Changing the checkpoint field will reset the stored checkpoint value. The next run will reprocess all data from scratch.`}
        opened={isModalOpen}
        onClose={handleCancel}
        onConfirm={handleConfirm}
      />
    </>
  );
}

export const UpdateIncrementalSettings = ({
  transform,
  readOnly,
}: UpdateIncrementalSettingsProps) => {
  const { initialValues, validationSchema, updateIncrementalSettings } =
    useUpdateIncrementalSettings(transform);

  return (
    <FormProvider
      initialValues={initialValues}
      validationSchema={validationSchema}
      onSubmit={_.noop}
      enableReinitialize
    >
      <Form>
        <ConfirmableInlineUpdater
          transform={transform}
          update={updateIncrementalSettings}
        />
        <IncrementalTransformSettingsWrapper
          transform={transform}
          readOnly={readOnly}
        />
      </Form>
    </FormProvider>
  );
};
