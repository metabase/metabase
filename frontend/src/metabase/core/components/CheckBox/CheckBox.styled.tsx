import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";
import { Icon } from "metabase/ui";

import { DEFAULT_ICON_PADDING } from "./constants";
import type {
  CheckBoxContainerProps,
  CheckBoxIconContainerProps,
  CheckBoxIconProps,
  CheckBoxInputProps,
  CheckBoxLabelProps,
} from "./types";

export const CheckBoxRoot = styled.label`
  display: block;
  position: relative;
`;

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

export const CheckBoxContainer = styled.span<CheckBoxContainerProps>`
  display: inline-flex;
  align-items: center;
  cursor: ${props => (props.disabled ? "" : "pointer")};
  max-width: 100%;
  opacity: ${props => (props.disabled ? "0.4" : "")};

  ${CheckBoxInput}:focus + & {
    outline: 2px solid ${color("focus")};
  }

  ${CheckBoxInput}:focus:not(:focus-visible) + & {
    outline: none;
  }
`;

export const CheckBoxIcon = styled(Icon)<CheckBoxIconProps>`
  display: block;
  padding: ${DEFAULT_ICON_PADDING / 2}px;
  color: ${props => color(props.checked ? "white" : props.uncheckedColor)};
  width: ${props => `${props.size}px`};
  height: ${props => `${props.size}px`};
`;

export const CheckBoxIconContainer = styled.span<CheckBoxIconContainerProps>`
  display: flex;
  justify-content: center;
  align-items: center;
  min-width: ${props => `${props.size}px`};
  width: ${props => `${props.size}px`};
  height: ${props => `${props.size}px`};
  border: 0.125rem solid
    ${props => color(props.checked ? props.checkedColor : props.uncheckedColor)};
  border-radius: 0.25rem;
  background-color: ${props =>
    color(props.checked ? props.checkedColor : "bg-white")};
`;

export const CheckBoxLabel = styled.span<CheckBoxLabelProps>`
  display: block;
  margin-left: 0.5rem;
  ${({ labelEllipsis }) =>
    labelEllipsis
      ? `;
         overflow: hidden;
         text-overflow: ellipsis;
         white-space: nowrap;
         `
      : ""}
`;
