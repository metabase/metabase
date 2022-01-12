import React, { forwardRef } from "react";

import {
  SelectButtonRoot,
  SelectButtonIcon,
  SelectButtonContent,
} from "./SelectButton.styled";

interface SelectButtonProps {
  className?: string;
  style: React.CSSProperties;
  children: React.ReactNode;
  hasValue?: boolean;
}

const SelectButton = forwardRef(function SelectButton(
  { className, style, children, hasValue = true }: SelectButtonProps,
  ref,
) {
  return (
    <SelectButtonRoot
      ref={ref}
      className={className}
      style={style}
      hasValue={hasValue}
      data-testid="select-button"
    >
      <SelectButtonContent data-testid="select-button-content">
        {children}
      </SelectButtonContent>
      <SelectButtonIcon name="chevrondown" size={12} />
    </SelectButtonRoot>
  );
});

export default SelectButton;
