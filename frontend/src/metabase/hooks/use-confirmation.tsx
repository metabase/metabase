import { useState } from "react";
import { t } from "ttag";

import _ConfirmContent from "metabase/components/ConfirmContent";
import _Modal from "metabase/components/Modal";
import { DEFAULT_MODAL_Z_INDEX } from "metabase/ui";

const Modal = _Modal as any;
const ConfirmContent = _ConfirmContent as any;

export const CONFIRM_MODAL_Z_INDEX = DEFAULT_MODAL_Z_INDEX + 100;

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
    <Modal
      isOpen
      onClose={handleClose}
      zIndex={CONFIRM_MODAL_Z_INDEX}
      data-testid="confirm-modal"
    >
      <ConfirmContent
        title={confirmationState.title}
        message={confirmationState?.message}
        confirmButtonText={confirmationState.confirmButtonText}
        cancelButtonText={confirmationState.cancelButtonText}
        onClose={handleClose}
        onAction={confirmationState.onConfirm}
      />
    </Modal>
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
