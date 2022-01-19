import React, { ReactNode } from "react";
import {
  CheckBoxContainer,
  CheckBoxIcon,
  CheckBoxIconContainer,
  CheckBoxInput,
  CheckBoxLabel,
  CheckBoxRoot,
} from "./CheckBox.styled";

export interface CheckBoxProps {
  label?: ReactNode;
  checked?: boolean;
  indeterminate?: boolean;
}

export const CheckBox = ({
  label,
  checked,
  indeterminate,
}: CheckBoxProps): JSX.Element => {
  return (
    <CheckBoxRoot>
      <CheckBoxInput type="checkbox" checked={checked} />
      <CheckBoxContainer>
        <CheckBoxIconContainer>
          <CheckBoxIcon name={indeterminate ? "dash" : "check"} />
        </CheckBoxIconContainer>
        {label && <CheckBoxLabel>{label}</CheckBoxLabel>}
      </CheckBoxContainer>
    </CheckBoxRoot>
  );
};
