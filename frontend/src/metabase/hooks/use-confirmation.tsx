import { useState } from "react";
import { t } from "ttag";

import { ConfirmModal } from "metabase/components/ConfirmModal";

export type ConfirmationState = {
  title: string;
  message?: string;
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
      confirmButtonText={confirmationState.confirmButtonText}
    />
  ) : null;

  const show = ({
    title,
    message,
    onConfirm,
    confirmButtonText = t`Confirm`,
    cancelButtonText = t`Cancel`,
  }: ConfirmationState) =>
    setConfirmationState({
      title,
      message,
      onConfirm,
      confirmButtonText,
      cancelButtonText,
    });

  return { modalContent, show };
};
