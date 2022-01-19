import React, { LabelHTMLAttributes, ReactNode } from "react";
import {
  CheckBoxContainer,
  CheckBoxIcon,
  CheckBoxIconContainer,
  CheckBoxInput,
  CheckBoxLabel,
  CheckBoxRoot,
} from "./CheckBox.styled";

export interface CheckBoxProps extends LabelHTMLAttributes<HTMLLabelElement> {
  label?: ReactNode;
  checked?: boolean;
  indeterminate?: boolean;
  disabled?: boolean;
  size?: number;
  checkedColor?: string;
  uncheckedColor?: string;
}

const CheckBox = ({
  label,
  checked,
  indeterminate,
  disabled,
  size = 16,
  checkedColor = "brand",
  uncheckedColor = "text-light",
}: CheckBoxProps): JSX.Element => {
  return (
    <CheckBoxRoot>
      <CheckBoxInput type="checkbox" checked={checked} />
      <CheckBoxContainer disabled={disabled}>
        <CheckBoxIconContainer
          checked={checked}
          size={size}
          checkedColor={checkedColor}
          uncheckedColor={uncheckedColor}
        >
          <CheckBoxIcon
            name={indeterminate ? "dash" : "check"}
            checked={checked}
            uncheckedColor={uncheckedColor}
          />
        </CheckBoxIconContainer>
        {label && <CheckBoxLabel>{label}</CheckBoxLabel>}
      </CheckBoxContainer>
    </CheckBoxRoot>
  );
};

export default CheckBox;
