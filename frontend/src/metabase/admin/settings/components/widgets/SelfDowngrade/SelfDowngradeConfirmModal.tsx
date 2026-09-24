import { t } from "ttag";

import { ConfirmModal } from "metabase/common/components/ConfirmModal";

interface SelfDowngradeConfirmModalProps {
  opened: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export function SelfDowngradeConfirmModal({
  opened,
  onConfirm,
  onClose,
}: SelfDowngradeConfirmModalProps) {
  return (
    <ConfirmModal
      opened={opened}
      title={t`Downgrade to your previous version?`}
      content={t`Metabase will restore the previous version and restart. It will be unavailable for a while, possibly several minutes, and anyone using it will be interrupted.`}
      message={t`Make sure you have a recent backup of your application database before continuing.`}
      confirmButtonText={t`Downgrade now`}
      onConfirm={onConfirm}
      onClose={onClose}
    />
  );
}
