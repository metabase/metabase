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
  onClear?: () => void;
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
      hasValue={hasValue}
      disabled={disabled}
      highlighted={highlighted}
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
        hasValue={hasValue}
        highlighted={highlighted}
        onClick={onClear ? handleClear : undefined}
      />
    </SelectButtonRoot>
  );
});

export default Object.assign(SelectButton, {
  Root: SelectButtonRoot,
});
