import styled from "styled-components";
import Icon from "metabase/components/Icon";
import { color } from "metabase/lib/colors";

export const CheckBoxRoot = styled.label`
  display: block;
`;

export const CheckBoxInput = styled.input`
  appearance: none;
  display: block;
`;

export interface CheckBoxContainerProps {
  disabled: boolean | undefined;
}

export const CheckBoxContainer = styled.span<CheckBoxContainerProps>`
  display: flex;
  align-items: center;
  opacity: ${props => (props.disabled ? "0.4" : "")};
`;

export interface CheckBoxIconProps {
  checked?: boolean;
  uncheckedColor: string;
}

export const CheckBoxIcon = styled(Icon)<CheckBoxIconProps>`
  display: block;
  color: ${props => color(props.checked ? "white" : props.uncheckedColor)};
`;

export interface CheckBoxIconContainerProps {
  size: number;
  checked: boolean | undefined;
  checkedColor: string;
  uncheckedColor: string;
}

export const CheckBoxIconContainer = styled.span<CheckBoxIconContainerProps>`
  display: flex;
  justify-content: center;
  align-items: center;
  width: ${props => `${props.size}px`};
  height: ${props => `${props.size}px`};
  border: 0.125rem solid
    ${props => color(props.checked ? props.checkedColor : props.uncheckedColor)};
  border-radius: 0.25rem;
  background-color: ${props =>
    color(props.checked ? props.checkedColor : "bg-white")};
`;

export const CheckBoxLabel = styled.span`
  display: block;
  margin-left: 0.5rem;
`;
