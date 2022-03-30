import React, { HTMLAttributes } from "react";
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
  className: string;
  onConfirm: () => void;
  onDismiss: () => void;
}

const Toaster = ({
  message,
  show,
  onConfirm,
  onDismiss,
  className,
}: ToasterProps): JSX.Element => {
  return (
    <ToasterContainer show={show} className={className}>
      <ToasterMessage>{message}</ToasterMessage>
      <ToasterButton onClick={onConfirm}>Turn on</ToasterButton>
      <Icon name="close" color={color("bg-dark")} onClick={onDismiss} />
    </ToasterContainer>
  );
};

export default Toaster;
