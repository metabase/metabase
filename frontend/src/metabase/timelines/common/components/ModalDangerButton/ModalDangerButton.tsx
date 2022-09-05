import React, { MouseEvent, ReactNode } from "react";
import { DangerButton } from "./ModalDangerButton.styled";

export interface ModalDangerButtonProps {
  children?: ReactNode;
  onClick?: (event: MouseEvent) => void;
}

const ModalDangerButton = ({
  children,
  onClick,
}: ModalDangerButtonProps): JSX.Element => {
  return (
    <DangerButton type="button" borderless onClick={onClick}>
      {children}
    </DangerButton>
  );
};

export default ModalDangerButton;
