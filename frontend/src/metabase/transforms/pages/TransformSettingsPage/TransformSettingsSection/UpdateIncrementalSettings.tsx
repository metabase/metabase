import { useDisclosure } from "@mantine/hooks";
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
import { Form, FormInlineUpdater, FormProvider } from "metabase/forms";
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
      <Box c="text-secondary">
        {t`Current checkpoint`}:{" "}
        <Text component="span" fw="bold" c="text-primary">
          <CheckpointValue
            value={transform.last_checkpoint_value}
            checkpointField={checkpointField}
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
        confirmButtonText={t`Reset`}
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
 * Hook that intercepts checkpoint field changes to show a confirmation modal
 * when a checkpoint value already exists. Must be used inside FormProvider.
 */
function useCheckpointChangeInterceptor(transform: Transform) {
  const { resetForm } = useFormikContext<IncrementalSettingsFormValues>();
  const [isModalOpen, { open: openModal, close: closeModal }] = useDisclosure();
  const pendingResolve = useRef<((shouldProceed: boolean) => void) | null>(
    null,
  );

  const currentFieldId =
    transform.source?.["source-incremental-strategy"]?.[
      "checkpoint-filter-field-id"
    ];

  const onBeforeUpdate = useCallback(
    async (values: IncrementalSettingsFormValues): Promise<boolean> => {
      const waitingForCheckpointSelection =
        values.incremental &&
        values.sourceStrategy === "checkpoint" &&
        values.checkpointFilterFieldId == null;

      if (waitingForCheckpointSelection) {
        return false;
      }

      const fieldChanged =
        currentFieldId != null &&
        values.checkpointFilterFieldId != null &&
        String(currentFieldId) !== values.checkpointFilterFieldId;

      if (fieldChanged && transform.last_checkpoint_value != null) {
        return new Promise<boolean>((resolve) => {
          pendingResolve.current = resolve;
          openModal();
        });
      }

      return true;
    },
    [transform, currentFieldId, openModal],
  );

  const handleConfirm = useCallback(() => {
    pendingResolve.current?.(true);
    pendingResolve.current = null;
    closeModal();
  }, [closeModal]);

  const handleCancel = useCallback(() => {
    resetForm();
    pendingResolve.current?.(false);
    pendingResolve.current = null;
    closeModal();
  }, [resetForm, closeModal]);

  return {
    onBeforeUpdate,
    modalProps: {
      title: t`Change checkpoint field?`,
      message: t`Changing the checkpoint field will reset the stored checkpoint value. The next run will reprocess all data from scratch.`,
      confirmButtonText: t`Change checkpoint field`,
      opened: isModalOpen,
      onClose: handleCancel,
      onConfirm: handleConfirm,
    },
  };
}

function UpdateIncrementalSettingsContent({
  transform,
  readOnly,
  updateIncrementalSettings,
}: UpdateIncrementalSettingsProps & {
  updateIncrementalSettings: (
    values: IncrementalSettingsFormValues,
  ) => Promise<unknown>;
}) {
  const { sendSuccessToast, sendErrorToast } = useMetadataToasts();
  const { onBeforeUpdate, modalProps } =
    useCheckpointChangeInterceptor(transform);

  return (
    <>
      <FormInlineUpdater
        update={updateIncrementalSettings}
        onBeforeUpdate={onBeforeUpdate}
        onSuccess={() =>
          sendSuccessToast(t`Incremental transformation settings updated`)
        }
        onError={() =>
          sendErrorToast(
            t`Failed to update incremental transformation settings`,
          )
        }
      />
      <ConfirmModal {...modalProps} />
      <IncrementalTransformSettingsWrapper
        transform={transform}
        readOnly={readOnly}
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
        <UpdateIncrementalSettingsContent
          transform={transform}
          readOnly={readOnly}
          updateIncrementalSettings={updateIncrementalSettings}
        />
      </Form>
    </FormProvider>
  );
};
