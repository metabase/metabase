import React, { ButtonHTMLAttributes, forwardRef } from "react";

import {
  SelectButtonRoot,
  SelectButtonIcon,
  SelectButtonContent,
} from "./SelectButton.styled";

interface SelectButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
  hasValue?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
}

const SelectButton = forwardRef(function SelectButton(
  {
    className,
    style,
    children,
    hasValue = true,
    disabled,
    fullWidth = true,
    ...rest
  }: SelectButtonProps,
  ref,
) {
  return (
    <SelectButtonRoot
      ref={ref}
      className={className}
      style={style}
      hasValue={hasValue}
      disabled={disabled}
      fullWidth={fullWidth}
      {...rest}
    >
      <SelectButtonContent>{children}</SelectButtonContent>
      <SelectButtonIcon name="chevrondown" size={12} />
    </SelectButtonRoot>
  );
});

export default SelectButton;
