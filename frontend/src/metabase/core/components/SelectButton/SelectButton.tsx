import React, {
  ButtonHTMLAttributes,
  forwardRef,
  Ref,
  useCallback,
  useMemo,
} from "react";
import {
  SelectButtonRoot,
  SelectButtonIcon,
  SelectButtonContent,
} from "./SelectButton.styled";
import { SelectButtonVariant } from "./types";

export interface SelectButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  left?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
  variant?: SelectButtonVariant;
  hasValue?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  onClear?: () => void;
}

const SelectButton = forwardRef(function SelectButton(
  {
    className,
    style,
    children,
    left,
    variant = "secondary",
    hasValue = true,
    disabled,
    fullWidth = true,
    onClear,
    ...rest
  }: SelectButtonProps,
  ref: Ref<HTMLButtonElement>,
) {
  const handleClear = useCallback(
    event => {
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
      data-testid="select-button"
      ref={ref}
      className={className}
      style={style}
      variant={variant}
      hasValue={hasValue}
      disabled={disabled}
      fullWidth={fullWidth}
      {...rest}
    >
      {React.isValidElement(left) && left}
      <SelectButtonContent data-testid="select-button-content">
        {children}
      </SelectButtonContent>
      <SelectButtonIcon
        name={rightIcon}
        size={12}
        onClick={onClear ? handleClear : undefined}
      />
    </SelectButtonRoot>
  );
});

export default Object.assign(SelectButton, {
  Root: SelectButtonRoot,
});
