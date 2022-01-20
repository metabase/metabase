import React, { ButtonHTMLAttributes, forwardRef } from "react";

import {
  SelectButtonRoot,
  SelectButtonIcon,
  SelectButtonContent,
} from "./SelectButton.styled";

interface SelectButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  left?: React.ReactNode;
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
    left,
    hasValue = true,
    disabled,
    fullWidth = true,
    ...rest
  }: SelectButtonProps,
  ref,
) {
  return (
    <SelectButtonRoot
      type="button"
      data-testid="select-button"
      innerRef={ref as any}
      className={className}
      style={style}
      hasValue={hasValue}
      disabled={disabled}
      fullWidth={fullWidth}
      {...rest}
    >
      {React.isValidElement(left) && left}
      <SelectButtonContent data-testid="select-button-content">
        {children}
      </SelectButtonContent>
      <SelectButtonIcon name="chevrondown" size={12} />
    </SelectButtonRoot>
  );
});

export default SelectButton;
