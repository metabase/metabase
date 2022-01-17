import React, { ButtonHTMLAttributes } from "react";
import { ButtonRoot } from "./Button.styled";
import { ButtonVariant } from "./types";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  disabled?: boolean;
  fullWidth?: boolean;
}

const Button = ({
  variant = "secondary",
  disabled = false,
  fullWidth = false,
  children,
  ...props
}: ButtonProps): JSX.Element => {
  return (
    <ButtonRoot
      variant={variant}
      disabled={disabled}
      fullWidth={fullWidth}
      {...props}
    >
      {children}
    </ButtonRoot>
  );
};

export default Button;
