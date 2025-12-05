import { type ReactNode, useCallback, useState } from "react";
import { t } from "ttag";

import { ConfirmModal } from "metabase/common/components/ConfirmModal";
import type { ButtonProps, MantineSize } from "metabase/ui";

export type ConfirmationState = {
  title: string;
  message?: string | ReactNode;
  onConfirm: () => void;
  onCancel?: () => void;
  confirmButtonText?: string;
  cancelButtonText?: string;
  confirmButtonProps?: Omit<ButtonProps, "onClick" | "children">;
  size?: MantineSize;
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
      confirmButtonProps={confirmationState.confirmButtonProps}
      size={confirmationState.size}
    />
  ) : null;

  const show = useCallback(
    ({
      title,
      message,
      onConfirm,
      onCancel,
      confirmButtonText = t`Confirm`,
      cancelButtonText = t`Cancel`,
      confirmButtonProps,
      size,
    }: ConfirmationState) =>
      setConfirmationState({
        title,
        message,
        onConfirm,
        onCancel,
        confirmButtonText,
        cancelButtonText,
        confirmButtonProps,
        size,
      }),
    [],
  );

  return { modalContent, show };
};
