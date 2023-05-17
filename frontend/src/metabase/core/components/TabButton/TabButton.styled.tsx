import styled from "@emotion/styled";
import { css } from "@emotion/react";

import { color } from "metabase/lib/colors";
import Button from "metabase/core/components/Button";

export interface TabButtonProps {
  isSelected?: boolean;
  disabled?: boolean;
}

// Wrapper and Resizer are needed to auto-grow the input with its content
// https://css-tricks.com/auto-growing-inputs-textareas/#aa-resizing-actual-input-elements
export const TabButtonInputWrapper = styled.span`
  position: relative;
`;

export const TabButtonInputResizer = styled.span`
  visibility: hidden;
  white-space: pre;
`;

export const TabButtonInput = styled.input<TabButtonProps & { value: string }>`
  position: absolute;
  width: 100%;
  left: 0;
  padding: 0;

  border: none;
  outline: none;
  background-color: transparent;

  color: ${props => (props.isSelected ? color("brand") : color("text-dark"))};
  font-size: inherit;
  font-weight: bold;
  text-align: center;

  ${props =>
    props.disabled &&
    css`
      pointer-events: none;
    `}
`;

export const TabButtonRoot = styled.div<TabButtonProps>`
  display: flex;

  padding: 1rem 0;

  color: ${props =>
    props.isSelected && !props.disabled ? color("brand") : color("text-dark")};
  opacity: ${props => (props.disabled ? 0.3 : 1)};
  font-size: 0.875rem;
  font-weight: 700;

  cursor: ${props => (props.disabled ? "default" : "pointer")};

  border-bottom: 3px solid
    ${props => (props.isSelected ? color("brand") : "transparent")};
`;

export const MenuButton = styled(Button)<TabButtonProps & { isOpen: boolean }>`
  transition: background-color 0s;

  border: none;

  padding: 0.25rem;
  margin-left: 0.25rem;

  ${props =>
    props.isSelected &&
    css`
      color: ${color("brand")};
    `}

  ${props =>
    props.isOpen &&
    !props.disabled &&
    css`
      color: ${color("brand")};
      background-color: ${color("bg-medium")};
    `}
  &:hover,:focus {
    ${props =>
      props.disabled
        ? css`
            color: ${color("text-dark")};
          `
        : css`
            color: ${color("brand")};
            background-color: ${color("bg-medium")};
          `}
  }
`;

export const MenuContent = styled.ul`
  padding: 0.5rem;
`;

export const MenuItem = styled.li`
  width: 100%;
  padding: 0.85em 1.45em;
  border-radius: 0.5em;

  color: ${color("text-dark")};
  font-weight: 700;
  text-align: start;
  text-decoration: none;

  cursor: pointer;
  &:focus,
  :hover {
    color: ${color("brand")};
    background-color: ${color("bg-light")};
  }
`;
