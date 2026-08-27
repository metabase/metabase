import { t } from "ttag";

import { ConfirmModal } from "metabase/common/components/ConfirmModal";

type RegenerateKeyConfirmModalProps = {
  onConfirm: () => void;
  onClose: () => void;
};

export const RegenerateKeyConfirmModal = ({
  onConfirm,
  onClose,
}: RegenerateKeyConfirmModalProps) => (
  <ConfirmModal
    opened
    withCloseButton={false}
    closeOnClickOutside={false}
    closeOnEscape={false}
    title={t`Delete key and generate a new one?`}
    message={t`This will cause existing tokens to stop working until the identity provider is updated with a new key.`}
    confirmButtonText={t`Delete key`}
    confirmButtonProps={{ color: "feedback-negative" }}
    closeButtonText={t`No, don't delete`}
    onConfirm={onConfirm}
    onClose={onClose}
  />
);
