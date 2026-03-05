import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import { useCancelCurrentTransformRunMutation } from "metabase/api";
import { ConfirmModal } from "metabase/common/components/ConfirmModal";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { Button } from "metabase/ui";
import type { TransformRun } from "metabase-types/api";

type CancelationSectionProps = {
  run: TransformRun;
};

export function CancelationSection({ run }: CancelationSectionProps) {
  const [isModalOpen, { open: openModal, close: closeModal }] = useDisclosure();
  const { sendErrorToast } = useMetadataToasts();
  const [cancelTransformRun, { isLoading: isCanceling }] =
    useCancelCurrentTransformRunMutation();

  const handleCancel = async () => {
    if (run.transform == null) {
      return;
    }
    const { error } = await cancelTransformRun(run.transform.id);
    closeModal();
    if (error) {
      sendErrorToast(t`Failed to cancel transform`);
    }
  };

  return (
    <>
      <div>
        <Button
          variant="filled"
          color="error"
          disabled={isCanceling}
          onClick={openModal}
        >
          {t`Cancel run`}
        </Button>
      </div>
      <ConfirmModal
        title={t`Cancel this run?`}
        closeButtonText={t`No`}
        opened={isModalOpen}
        onClose={closeModal}
        onConfirm={handleCancel}
      />
    </>
  );
}
