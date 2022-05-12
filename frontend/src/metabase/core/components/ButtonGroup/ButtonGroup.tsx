import React, { ReactNode } from "react";

export interface ButtonGroupProps {
  children?: ReactNode;
}

const ButtonGroup = ({ children }: ButtonGroupProps): JSX.Element => {
  return <div>{children}</div>;
};

export default ButtonGroup;
