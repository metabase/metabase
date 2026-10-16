import { t } from "ttag";

import { ConfirmModal } from "metabase/common/components/ConfirmModal";

import type { SwitchAdvancedMode } from "../../types";

type Props = {
  message: string;
  loading: boolean;
  onConfirm: SwitchAdvancedMode;
  onClose: () => void;
};

export function EnableAdvancedModal({
  message,
  loading,
  onConfirm,
  onClose,
}: Props) {
  const handleConfirm = async () => {
    if (await onConfirm()) {
      onClose();
    }
  };

  return (
    <ConfirmModal
      opened
      onClose={onClose}
      title={t`Switch to group-level permissions?`}
      message={message}
      confirmButtonText={t`Switch`}
      confirmButtonProps={{
        color: "brand",
        variant: "filled",
        loading,
      }}
      closeButtonProps={{ disabled: loading, variant: "subtle" }}
      onConfirm={handleConfirm}
    />
  );
}
