import type { HTMLAttributes } from "react";
import { useEffect, useState } from "react";
import { t } from "ttag";

import { Icon, Portal } from "metabase/ui";

import {
  ToasterButton,
  ToasterContainer,
  ToasterDismiss,
  ToasterMessage,
} from "./Toaster.styled";

export interface ToastProps extends HTMLAttributes<HTMLDivElement> {
  message: string;
  confirmText?: string;
  confirmAriaLabel?: string;
  closeAriaLabel?: string;
  show: boolean;
  fixed?: boolean;
  canClose?: boolean;
  secondaryText?: string;
  secondaryAriaLabel?: string;
  onConfirm: () => void;
  onDismiss?: () => void;
  onSecondary?: () => void;
  "data-testid"?: string;
}

export const Toast = ({
  message,
  confirmText = t`Turn on`,
  confirmAriaLabel = t`Confirm`,
  closeAriaLabel = t`Close`,
  show,
  fixed,
  canClose = true,
  secondaryText,
  secondaryAriaLabel = t`Cancel`,
  onConfirm,
  onDismiss,
  onSecondary,
  className,
  "data-testid": dataTestId = "toast",
  ...divProps
}: ToastProps): JSX.Element => (
  <ToasterContainer
    data-testid={dataTestId}
    show={show}
    fixed={fixed}
    className={className}
    {...divProps}
  >
    <ToasterMessage>{message}</ToasterMessage>
    {secondaryText && onSecondary && (
      <ToasterButton onClick={onSecondary} aria-label={secondaryAriaLabel}>
        {secondaryText}
      </ToasterButton>
    )}
    <ToasterButton onClick={onConfirm} aria-label={confirmAriaLabel}>
      {confirmText}
    </ToasterButton>
    {canClose && (
      <ToasterDismiss onClick={onDismiss} aria-label={closeAriaLabel}>
        <Icon name="close" />
      </ToasterDismiss>
    )}
  </ToasterContainer>
);

export interface ToasterProps extends HTMLAttributes<HTMLDivElement> {
  message: string;
  confirmText?: string;
  isShown: boolean;
  fixed?: boolean;
  className: string;
  onConfirm: () => void;
  onDismiss: () => void;
}

// TODO: Port to Mantine Notifications or consolidate with Undo-style toasts or
// BulkActionsToast
export const Toaster = ({
  message,
  confirmText = t`Turn on`,
  isShown,
  fixed,
  onConfirm,
  onDismiss,
  className,
  ...divProps
}: ToasterProps): JSX.Element | null => {
  const [open, setOpen] = useState(false);
  const [render, setRender] = useState(false);

  useEffect(() => {
    if (isShown) {
      setRender(true);
      setTimeout(() => {
        setOpen(true);
      }, 100);
    } else {
      setOpen(false);
      setTimeout(() => {
        setRender(false);
      }, 300);
    }
  }, [isShown]);

  return render ? (
    <Portal>
      <Toast
        message={message}
        confirmText={confirmText}
        show={open}
        fixed={fixed}
        onConfirm={onConfirm}
        onDismiss={onDismiss}
        className={className}
        {...divProps}
      />
    </Portal>
  ) : null;
};
