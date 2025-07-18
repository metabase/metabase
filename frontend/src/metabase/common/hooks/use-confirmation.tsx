import { useState } from "react";
import { t } from "ttag";

import { ConfirmModal } from "metabase/common/components/ConfirmModal";
import type { ButtonProps } from "metabase/ui";

export type ConfirmationState = {
  title: string;
  message?: string;
  onConfirm: () => void;
  confirmButtonText?: string;
  cancelButtonText?: string;
  confirmButtonProps?: Omit<ButtonProps, "onClick" | "children">;
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
      confirmButtonProps={confirmationState.confirmButtonProps}
    />
  ) : null;

  const show = ({
    title,
    message,
    onConfirm,
    confirmButtonText = t`Confirm`,
    cancelButtonText = t`Cancel`,
    confirmButtonProps,
  }: ConfirmationState) =>
    setConfirmationState({
      title,
      message,
      onConfirm,
      confirmButtonText,
      cancelButtonText,
      confirmButtonProps,
    });

  return { modalContent, show };
};
