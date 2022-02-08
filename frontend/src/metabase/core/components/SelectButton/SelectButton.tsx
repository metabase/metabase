import React, {
  ButtonHTMLAttributes,
  forwardRef,
  useCallback,
  useMemo,
} from "react";

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
  onClear?: () => void;
}

const SelectButton = forwardRef<HTMLButtonElement, SelectButtonProps>(
  function SelectButton(
    {
      className,
      style,
      children,
      left,
      hasValue = true,
      disabled,
      fullWidth = true,
      onClear,
      ...rest
    }: SelectButtonProps,
    ref,
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
        ref={ref as any}
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
        <SelectButtonIcon
          name={rightIcon}
          size={12}
          onClick={onClear ? handleClear : undefined}
        />
      </SelectButtonRoot>
    );
  },
);

export default Object.assign(SelectButton, {
  Root: SelectButtonRoot,
});
