import styled from "styled-components";
import Icon from "metabase/components/Icon";
import { color } from "metabase/lib/colors";

export const CheckBoxRoot = styled.label`
  display: block;
  position: relative;
`;

export interface CheckBoxInputProps {
  size: number;
}

export const CheckBoxInput = styled.input<CheckBoxInputProps>`
  appearance: none;
  display: block;
  position: absolute;
  left: 0;
  right: 0;
  width: ${props => `${props.size}px`};
  height: 100%;
  margin: 0;
  padding: 0;
  cursor: ${props => (props.disabled ? "" : "pointer")};
  opacity: 0;
  z-index: 1;
`;

export interface CheckBoxContainerProps {
  disabled: boolean | undefined;
}

export const CheckBoxContainer = styled.span<CheckBoxContainerProps>`
  display: inline-flex;
  align-items: center;
  cursor: ${props => (props.disabled ? "" : "pointer")};
  opacity: ${props => (props.disabled ? "0.4" : "")};

  ${CheckBoxInput}:focus-visible + & {
    outline: 2px solid ${color("brand-light")};
  }
`;

export interface CheckBoxIconProps {
  checked?: boolean;
  uncheckedColor: string;
}

export const CheckBoxIcon = styled(Icon)<CheckBoxIconProps>`
  display: block;
  color: ${props => color(props.checked ? "white" : props.uncheckedColor)};
  width: ${props => `${props.size}px`};
  height: ${props => `${props.size}px`};
`;

export interface CheckBoxIconContainerProps {
  checked: boolean | undefined;
  size: number;
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
