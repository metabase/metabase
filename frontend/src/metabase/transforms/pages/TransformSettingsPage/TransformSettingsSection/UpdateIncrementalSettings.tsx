import { useDisclosure } from "@mantine/hooks";
import { useFormikContext } from "formik";
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
  const [isModalOpen, { open: openModal, close: closeModal }] =
    useDisclosure();
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
        variant="subtle"
        size="compact-sm"
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

export const UpdateIncrementalSettings = ({
  transform,
  readOnly,
}: UpdateIncrementalSettingsProps) => {
  const { sendSuccessToast, sendErrorToast } = useMetadataToasts();

  const showSuccessToast = () =>
    sendSuccessToast(t`Incremental transformation settings updated`);

  const showErrorToast = () =>
    sendErrorToast(t`Failed to update incremental transformation settings`);

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
        <FormInlineUpdater
          update={updateIncrementalSettings}
          onSuccess={showSuccessToast}
          onError={showErrorToast}
        />
        <IncrementalTransformSettingsWrapper
          transform={transform}
          readOnly={readOnly}
        />
      </Form>
    </FormProvider>
  );
};
