import type { ButtonHTMLAttributes, Ref } from "react";
import { forwardRef, useCallback, useMemo } from "react";
import * as React from "react";

import {
  SelectButtonRoot,
  SelectButtonIcon,
  SelectButtonContent,
} from "./SelectButton.styled";

export interface SelectButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  left?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
  hasValue?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  highlighted?: boolean;
  onClick?: () => void;
  onClear?: () => void;
  dataTestId?: string;
}

const SelectButton = forwardRef(function SelectButton(
  {
    className,
    style,
    children,
    left,
    hasValue = true,
    disabled = false,
    fullWidth = true,
    highlighted = false,
    onClick,
    onClear,
    dataTestId,
    ...rest
  }: SelectButtonProps,
  ref: Ref<HTMLButtonElement>,
) {
  const handleClear = useCallback(
    (event: React.MouseEvent) => {
      if (onClear) {
        // Required not to trigger the usual SelectButton's onClick handler
        event.stopPropagation();
        onClear();
      }
    },
    [onClear],
  );

  const rightIcon = useMemo(() => {
    if (hasValue && onClear) {
      return "close";
    }
    return "chevrondown";
  }, [hasValue, onClear]);

  return (
    <SelectButtonRoot
      type="button"
      data-testid={`${dataTestId ? `${dataTestId}-` : ""}select-button`}
      ref={ref}
      className={className}
      style={style}
      hasValue={hasValue}
      disabled={disabled}
      highlighted={highlighted}
      fullWidth={fullWidth}
      onClick={onClick}
      {...rest}
    >
      {React.isValidElement(left) && left}
      <SelectButtonContent data-testid="select-button-content">
        {children}
      </SelectButtonContent>
      <SelectButtonIcon
        name={rightIcon}
        size={12}
        hasValue={hasValue}
        highlighted={highlighted}
        onClick={rightIcon === "close" ? handleClear : undefined}
      />
    </SelectButtonRoot>
  );
});

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default Object.assign(SelectButton, {
  Root: SelectButtonRoot,
  Content: SelectButtonContent,
  Icon: SelectButtonIcon,
});
