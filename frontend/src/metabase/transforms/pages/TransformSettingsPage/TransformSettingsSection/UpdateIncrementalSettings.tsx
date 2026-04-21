import { useDisclosure } from "@mantine/hooks";
import { useFormikContext } from "formik";
import { useCallback, useRef } from "react";
import { t } from "ttag";
import _ from "underscore";

import { ConfirmModal } from "metabase/common/components/ConfirmModal";
import { Form, FormInlineUpdater, FormProvider } from "metabase/forms";
import { useMetadataToasts } from "metabase/metadata/hooks";
import type { IncrementalSettingsFormValues } from "metabase/transforms/components/IncrementalTransform";
import {
  IncrementalTransformSettings,
  useUpdateIncrementalSettings,
} from "metabase/transforms/components/IncrementalTransform";
import type { Transform } from "metabase-types/api";

import { ResetCheckpointSection } from "./ResetCheckpointSection";

type UpdateIncrementalSettingsProps = {
  transform: Transform;
  readOnly?: boolean;
};

const IncrementalTransformSettingsWrapper = ({
  transform,
  readOnly,
}: UpdateIncrementalSettingsProps) => {
  const { values, setFieldValue } =
    useFormikContext<IncrementalSettingsFormValues>();

  const handleIncrementalChange = (value: boolean) => {
    setFieldValue("incremental", value);

    // If incremental is turned off, reset the checkpoint filter field
    if (!value) {
      setFieldValue("checkpointFilterFieldId", null);
    }
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

export function UpdateIncrementalSettings({
  transform,
  readOnly,
}: UpdateIncrementalSettingsProps) {
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
}

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
