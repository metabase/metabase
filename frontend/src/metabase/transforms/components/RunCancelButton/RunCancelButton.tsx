import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import {
  useCancelCurrentTransformRunMutation,
  useLazyGetTransformQuery,
} from "metabase/api";
import { ConfirmModal } from "metabase/common/components/ConfirmModal";
import { isResourceNotFoundError } from "metabase/lib/errors";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { ActionIcon, Icon, Tooltip } from "metabase/ui";
import type { Transform, TransformRunStatus } from "metabase-types/api";

export function RunCancelButton({
  status,
  transform,
}: {
  transform?: Transform;
  status: TransformRunStatus | null;
}) {
  const isRunning = status === "started";
  const [
    isConfirmCancelationModalOpen,
    { open: openCancelConfirmationModal, close: closeCancelConfirmationModal },
  ] = useDisclosure();
  const { sendErrorToast } = useMetadataToasts();
  const [fetchTransform, { isFetching }] = useLazyGetTransformQuery();
  const [cancelTransformRun, { isLoading: isCanceling }] =
    useCancelCurrentTransformRunMutation();

  const handleCancel = async () => {
    if (transform == null) {
      return;
    }
    const { error } = await cancelTransformRun(transform.id);
    closeCancelConfirmationModal();
    if (error && !isResourceNotFoundError(error)) {
      sendErrorToast(t`Failed to cancel transform`);
    } else {
      // fetch the transform to get the correct `last_run` info
      fetchTransform(transform.id);
    }
    return { error };
  };

  return (
    <>
      {isRunning && (
        <Tooltip label={t`Cancel`} position="bottom">
          <ActionIcon
            aria-label={t`Cancel run`}
            onClickCapture={(evt) => {
              evt.stopPropagation();
              openCancelConfirmationModal();
            }}
            disabled={isCanceling || isFetching}
            p={0}
            m={0}
            size="xs"
          >
            <Icon name="close" size={12} />
          </ActionIcon>
        </Tooltip>
      )}
      <ConfirmModal
        onClick={(evt) => {
          // Prevent click events from within the modal from bubbling up out of it.
          // This is needed because the model is rendered within the table row and the table
          // row has a click handler that navigates to the transform page.
          evt.stopPropagation();
        }}
        title={t`Cancel this run?`}
        opened={isConfirmCancelationModalOpen}
        onClose={closeCancelConfirmationModal}
        onConfirm={() => {
          handleCancel();
        }}
        closeButtonText={t`No`}
      />
    </>
  );
}
