import { useState } from "react";
import { t } from "ttag";

import { ConfirmModal } from "metabase/common/components/ConfirmModal";
import type { ModalProps } from "metabase/ui";

export type ConfirmationState = {
  title: string;
  message?: string;
  size?: ModalProps["size"];
  onConfirm: () => void;
  confirmButtonText?: string;
  cancelButtonText?: string;
};

export const useConfirmation = () => {
  const [confirmationState, setConfirmationState] =
    useState<ConfirmationState | null>(null);

  const handleClose = () => {
    setConfirmationState(null);
  };

  const modalContent = confirmationState ? (
    <ConfirmModal
      opened
      onConfirm={() => {
        confirmationState.onConfirm();
        handleClose();
      }}
      onClose={handleClose}
      data-testid="confirm-modal"
      title={confirmationState.title}
      message={confirmationState?.message}
      size={confirmationState?.size}
      confirmButtonText={confirmationState.confirmButtonText}
      closeButtonText={confirmationState.cancelButtonText}
    />
  ) : null;

  const show = ({
    title,
    message,
    onConfirm,
    confirmButtonText = t`Confirm`,
    cancelButtonText = t`Cancel`,
    size,
  }: ConfirmationState) =>
    setConfirmationState({
      title,
      message,
      onConfirm,
      confirmButtonText,
      cancelButtonText,
      size,
    });

  return { modalContent, show };
};
