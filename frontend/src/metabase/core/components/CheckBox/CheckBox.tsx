import React, {
  ChangeEvent,
  FocusEvent,
  forwardRef,
  Fragment,
  HTMLAttributes,
  isValidElement,
  ReactNode,
} from "react";
import {
  CheckBoxContainer,
  CheckBoxIcon,
  CheckBoxIconContainer,
  CheckBoxInput,
  CheckBoxLabel,
  CheckBoxRoot,
} from "./CheckBox.styled";

const DEFAULT_SIZE = 16;
const DEFAULT_ICON_PADDING = 4;
const DEFAULT_CHECKED_COLOR = "brand";
const DEFAULT_UNCHECKED_COLOR = "text-light";

export interface CheckBoxProps
  extends Omit<HTMLAttributes<HTMLElement>, "onChange" | "onFocus" | "onBlur"> {
  label?: ReactNode;
  checked?: boolean;
  indeterminate?: boolean;
  disabled?: boolean;
  size?: number;
  checkedColor?: string;
  uncheckedColor?: string;
  autoFocus?: boolean;
  onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
  onFocus?: (event: FocusEvent<HTMLInputElement>) => void;
  onBlur?: (event: FocusEvent<HTMLInputElement>) => void;
}

const CheckBox = forwardRef(function Checkbox(
  {
    label,
    checked,
    indeterminate,
    disabled,
    size = DEFAULT_SIZE,
    checkedColor = DEFAULT_CHECKED_COLOR,
    uncheckedColor = DEFAULT_UNCHECKED_COLOR,
    autoFocus,
    onChange,
    onFocus,
    onBlur,
    ...props
  }: CheckBoxProps,
  ref: any,
): JSX.Element {
  return (
    <CheckBoxRoot innerRef={ref} {...props}>
      <CheckBoxInput
        type="checkbox"
        checked={checked}
        size={size}
        autoFocus={autoFocus}
        onChange={onChange}
        onFocus={onFocus}
        onBlur={onBlur}
      />
      <CheckBoxContainer disabled={disabled}>
        <CheckBoxIconContainer
          checked={checked}
          size={size}
          checkedColor={checkedColor}
          uncheckedColor={uncheckedColor}
        >
          {(checked || indeterminate) && (
            <CheckBoxIcon
              name={indeterminate ? "dash" : "check"}
              checked={checked}
              size={size - DEFAULT_ICON_PADDING}
              uncheckedColor={uncheckedColor}
            />
          )}
        </CheckBoxIconContainer>
        {label && (
          <Fragment>
            {isValidElement(label) && label}
            {!isValidElement(label) && <CheckBoxLabel>{label}</CheckBoxLabel>}
          </Fragment>
        )}
      </CheckBoxContainer>
    </CheckBoxRoot>
  );
});

export default Object.assign(CheckBox, {
  Label: CheckBoxLabel,
});
