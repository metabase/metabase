// eslint-disable-next-line no-restricted-imports
import { css } from "@emotion/react";
// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

import Button from "metabase/common/components/Button";

interface TabButtonProps {
  isSelected?: boolean;
  disabled?: boolean;
}

// Wrapper and Resizer are needed to auto-grow the input with its content
// https://css-tricks.com/auto-growing-inputs-textareas/#aa-resizing-actual-input-elements
export const TabButtonInputWrapper = styled.span<TabButtonProps>`
  position: relative;
  padding: 0.25rem;
  border: 1px solid transparent;
  border-radius: 6px;
  line-height: 1.15; /* Matches .tabLabel */
`;

export const TabButtonInputResizer = styled.span`
  visibility: hidden;
  white-space: pre;
  padding-right: 2px;
`;

export const TabButtonInput = styled.input<TabButtonProps & { value: string }>`
  position: absolute;
  width: 100%;
  left: 0;
  bottom: -1px; /* offsets 1px input border */
  padding: 0.25rem;
  border: 1px solid transparent;
  border-radius: 4px;
  outline: none;
  background-color: transparent;
  color: inherit;
  font-size: inherit;
  font-weight: bold;
  text-align: center;

  ${(props) =>
    props.disabled &&
    css`
      pointer-events: none;
    `}
`;

export const TabButtonRoot = styled.div<TabButtonProps>`
  position: relative;
  display: flex;
  padding: calc(0.6875rem - 0.25rem - 1px) calc(0.5rem - 0.25rem - 2px); /* tab .list padding - input padding - borders/margins */
  color: ${(props) =>
    props.isSelected && !props.disabled
      ? "var(--mb-color-brand)"
      : "var(--mb-color-text-primary)"};
  opacity: ${(props) => (props.disabled ? 0.3 : 1)};
  font-size: var(--mantine-font-size-md);
  font-weight: 700;
  cursor: ${(props) => (props.disabled ? "default" : "pointer")};
  border-bottom: 0.125rem solid transparent;

  :hover {
    ${(props) =>
      !props.disabled &&
      css`
        color: var(--mb-color-brand);
      `}
  }

  :after {
    content: " ";
    position: absolute;
    top: 100%;
    left: 0;
    width: 100%;
    border-bottom: 0.125rem solid transparent;
  }

  ${(props) =>
    props.isSelected &&
    !props.disabled &&
    css`
      :after {
        border-color: var(--mb-color-brand);
      }
    `}
`;

export const MenuButton = styled(Button)<TabButtonProps & { isOpen: boolean }>`
  transition: background-color 0s;
  align-self: center;
  padding: 0.25rem;
  color: inherit;
  border: none;

  ${(props) =>
    props.isOpen &&
    !props.disabled &&
    css`
      color: var(--mb-color-brand);
      background-color: var(--mb-color-background-tertiary);
    `}
  &:hover,:focus {
    ${(props) =>
      props.disabled
        ? css`
            color: var(--mb-color-text-primary);
          `
        : css`
            color: var(--mb-color-brand);
            background-color: var(--mb-color-background-tertiary);
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
  color: var(--mb-color-text-primary);
  font-weight: 700;
  text-align: start;
  text-decoration: none;
  cursor: pointer;

  &:focus,
  :hover {
    color: var(--mb-color-brand);
    background-color: var(--mb-color-background-secondary);
  }
`;
