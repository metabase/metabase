import { useState } from "react";
import { t } from "ttag";

import { ConfirmModal } from "metabase/common/components/ConfirmModal";

export type ConfirmationState = {
  title: string;
  message?: string;
  onConfirm: () => void;
  onCancel?: () => void;
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
      onClose={() => {
        confirmationState.onCancel?.();
        handleClose();
      }}
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
    onCancel,
    confirmButtonText = t`Confirm`,
    cancelButtonText = t`Cancel`,
  }: ConfirmationState) =>
    setConfirmationState({
      title,
      message,
      onConfirm,
      onCancel,
      confirmButtonText,
      cancelButtonText,
    });

  return { modalContent, show };
};
