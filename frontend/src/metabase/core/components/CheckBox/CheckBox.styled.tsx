import styled from "styled-components";
import Icon from "metabase/components/Icon";
import { color } from "metabase/lib/colors";

const ICON_PADDING = 4;

export const CheckBoxRoot = styled.label`
  display: block;
`;

export const CheckBoxInput = styled.input`
  appearance: none;
  display: block;
  margin: 0;
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
  iconSize: number;
  uncheckedColor: string;
}

export const CheckBoxIcon = styled(Icon)<CheckBoxIconProps>`
  display: block;
  color: ${props => color(props.checked ? "white" : props.uncheckedColor)};
  width: ${props => `${props.iconSize - ICON_PADDING}px`};
  height: ${props => `${props.iconSize - ICON_PADDING}px`};
`;

export interface CheckBoxIconContainerProps {
  checked: boolean | undefined;
  iconSize: number;
  checkedColor: string;
  uncheckedColor: string;
}

export const CheckBoxIconContainer = styled.span<CheckBoxIconContainerProps>`
  display: flex;
  justify-content: center;
  align-items: center;
  width: ${props => `${props.iconSize}px`};
  height: ${props => `${props.iconSize}px`};
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
