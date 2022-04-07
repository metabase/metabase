import React, { useState, useEffect, HTMLAttributes } from "react";
import {
  ToasterContainer,
  ToasterMessage,
  ToasterButton,
} from "./Toaster.styled";
import Icon from "metabase/components/Icon";
import { color } from "metabase/lib/colors";

export interface ToasterProps extends HTMLAttributes<HTMLAnchorElement> {
  message: string;
  show: boolean;
  fixed?: boolean;
  className: string;
  onConfirm: () => void;
  onDismiss: () => void;
}

const Toaster = ({
  message,
  show,
  fixed,
  onConfirm,
  onDismiss,
  className,
}: ToasterProps): JSX.Element | null => {
  const [open, setOpen] = useState(false);
  const [render, setRender] = useState(false);

  useEffect(() => {
    if (show) {
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
  }, [show]);

  return render ? (
    <ToasterContainer show={open} fixed={fixed} className={className}>
      <ToasterMessage>{message}</ToasterMessage>
      <ToasterButton onClick={onConfirm}>Turn on</ToasterButton>
      <Icon name="close" color={color("bg-dark")} onClick={onDismiss} />
    </ToasterContainer>
  ) : null;
};

export default Toaster;
