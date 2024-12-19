import { css } from "@emotion/react";
import styled from "@emotion/styled";

export interface EditableTextRootProps {
  isEditing?: boolean;
  isDisabled: boolean;
  isEditingMarkdown?: boolean;
}

export const EditableTextRoot = styled.div<EditableTextRootProps>`
  position: relative;
  color: var(--mb-color-text-primary);
  padding: 0.25rem;
  border: 1px solid transparent;
  border-radius: 4px;
  word-wrap: break-word;

  &:hover,
  &:focus-within {
    border-color: ${props => !props.isDisabled && "var(--mb-color-border)"};
  }

  ${props =>
    props.isEditing &&
    !props.isDisabled &&
    css`
      border-color: var(--mb-color-border);
    `}

  ${({ isEditingMarkdown }) =>
    isEditingMarkdown &&
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
