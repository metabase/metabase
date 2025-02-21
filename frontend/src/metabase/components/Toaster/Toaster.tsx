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
const Toaster = ({
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
      <ToasterContainer
        show={open}
        fixed={fixed}
        className={className}
        {...divProps}
      >
        <ToasterMessage>{message}</ToasterMessage>
        <ToasterButton onClick={onConfirm} aria-label="Confirm">
          {confirmText}
        </ToasterButton>
        <ToasterDismiss onClick={onDismiss} aria-label="Close">
          <Icon name="close" />
        </ToasterDismiss>
      </ToasterContainer>
    </Portal>
  ) : null;
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default Toaster;
