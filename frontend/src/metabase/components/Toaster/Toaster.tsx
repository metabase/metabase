import type { HTMLAttributes } from "react";
import { useState, useEffect } from "react";
import { t } from "ttag";

import { Icon } from "metabase/ui";

import {
  ToasterContainer,
  ToasterMessage,
  ToasterButton,
  ToasterDismiss,
} from "./Toaster.styled";

export interface ToasterProps extends HTMLAttributes<HTMLAnchorElement> {
  message: string;
  confirmText?: string;
  isShown: boolean;
  fixed?: boolean;
  className: string;
  onConfirm: () => void;
  onDismiss: () => void;
}

const Toaster = ({
  message,
  confirmText = t`Turn on`,
  isShown,
  fixed,
  onConfirm,
  onDismiss,
  className,
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
    <ToasterContainer show={open} fixed={fixed} className={className}>
      <ToasterMessage>{message}</ToasterMessage>
      <ToasterButton onClick={onConfirm} aria-label="Confirm">
        {confirmText}
      </ToasterButton>
      <ToasterDismiss onClick={onDismiss} aria-label="Close">
        <Icon name="close" />
      </ToasterDismiss>
    </ToasterContainer>
  ) : null;
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default Toaster;
