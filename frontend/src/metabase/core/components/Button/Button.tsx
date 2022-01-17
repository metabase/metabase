import React, { ButtonHTMLAttributes } from "react";
import { ButtonRoot } from "./Button.styled";
import { ButtonVariant } from "./types";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  disabled?: boolean;
  round?: boolean;
  fullWidth?: boolean;
}

const Button = ({
  variant = "secondary",
  children,
  ...props
}: ButtonProps): JSX.Element => {
  return (
    <ButtonRoot variant={variant} {...props}>
      {children}
    </ButtonRoot>
  );
};

export default Button;
