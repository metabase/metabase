import React, { useState, useEffect, HTMLAttributes } from "react";
import { t } from "ttag";
import Icon from "metabase/components/Icon";

import {
  ToasterContainer,
  ToasterMessage,
  ToasterButton,
  ToasterDismiss,
} from "./Toaster.styled";

export interface ToasterProps extends HTMLAttributes<HTMLDivElement> {
  message: string;
  confirmText?: string;
  isShown: boolean;
  fixed?: boolean;
  className?: string;
  size?: "small" | "medium";
  onConfirm: () => void;
  onDismiss: () => void;
}

const Toaster = ({
  message,
  confirmText = t`Turn on`,
  isShown,
  fixed,
  className,
  size = "small",
  onConfirm,
  onDismiss,
  ...props
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
    <ToasterContainer
      show={open}
      fixed={fixed}
      size={size}
      className={className}
      {...props}
    >
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

export default Toaster;
