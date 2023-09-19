import { useCallback } from "react";
import type { ChangeEvent } from "react";

import {
  DEFAULT_CHECKED_COLOR,
  DEFAULT_UNCHECKED_COLOR,
  DEFAULT_SIZE,
} from "metabase/components/CheckBox";

import {
  StackedCheckBoxRoot,
  OpaqueCheckBox,
  StackedBackground,
  Label,
} from "./StackedCheckBox.styled";

interface StackedCheckBoxPropTypes {
  label?: string;
  ariaLabel?: string;
  checked?: boolean;
  disabled?: boolean;
  checkedColor?: string;
  uncheckedColor?: string;
  size?: number;
  className?: string;
  indeterminate?: boolean;
  onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
}

export function StackedCheckBox({
  label,
  ariaLabel,
  checked = false,
  disabled = false,
  checkedColor = DEFAULT_CHECKED_COLOR,
  uncheckedColor = DEFAULT_UNCHECKED_COLOR,
  size = DEFAULT_SIZE,
  className,
  indeterminate = false,
  onChange,
}: StackedCheckBoxPropTypes) {
  const renderLabel = useCallback(() => {
    if (label == null) {
      return null;
    }
    return <Label>{label}</Label>;
  }, [label]);

  return (
    <StackedCheckBoxRoot
      aria-label={ariaLabel ?? ""}
      className={className}
      disabled={disabled}
    >
      <OpaqueCheckBox
        label={renderLabel()}
        checked={checked}
        disabled={disabled}
        checkedColor={checkedColor}
        uncheckedColor={uncheckedColor}
        size={size}
        indeterminate={indeterminate}
        onChange={onChange}
      />
      <StackedBackground
        checked={checked}
        checkedColor={checkedColor}
        uncheckedColor={uncheckedColor}
        size={size}
      />
    </StackedCheckBoxRoot>
  );
}
