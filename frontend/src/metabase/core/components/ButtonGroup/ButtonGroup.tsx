import React, { ReactNode } from "react";
import { ButtonGroupRoot } from "./ButtonGroup.styled";

export interface ButtonGroupProps {
  children?: ReactNode;
}

const ButtonGroup = ({ children }: ButtonGroupProps): JSX.Element => {
  return <ButtonGroupRoot>{children}</ButtonGroupRoot>;
};

export default ButtonGroup;
