import { css } from "@emotion/react";
import styled from "@emotion/styled";

export interface EditableTextRootProps {
  isInFocus: boolean; // TODO Rename prop
  isDisabled: boolean;
  hasHoverBorder?: boolean;
}

export const EditableTextRoot = styled.div<EditableTextRootProps>`
  position: relative;
  color: var(--mb-color-text-dark);
  padding: 0.25rem;
  border: 1px solid transparent;
  border-radius: 4px;
  word-wrap: break-word;

  &:focus-within {
    border-color: ${props => !props.isDisabled && "var(--mb-color-border)"};
  }

  ${({ isDisabled, isInFocus, hasHoverBorder = true }) =>
    hasHoverBorder &&
    css`
      border-color: ${isInFocus && "var(--mb-color-border)"};

      &:hover {
        border-color: ${!isDisabled && "var(--mb-color-border)"};
      }
    `}

  ${({ isInFocus }) =>
    !isInFocus &&
    css`
      &:after {
        content: attr(data-value);
        visibility: hidden;
        white-space: pre-wrap;
        word-wrap: break-word;
      }
    `}
`;

export const EditableTextArea = styled.textarea`
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  min-height: 0;
  padding: inherit;
  color: inherit;
  font-size: inherit;
  font-weight: inherit;
  line-height: inherit;
  cursor: ${props => (props.disabled ? "text" : "pointer")};
  border: none;
  resize: none;
  outline: none;
  overflow: hidden;
  background: transparent;

  &:focus {
    cursor: text;
  }
`;
