import { css } from "@emotion/react";
import styled from "@emotion/styled";

import { focusOutlineStyle } from "metabase/core/style/input";

export interface TextAreaRootProps {
  readOnly?: boolean;
  hasError?: boolean;
  fullWidth?: boolean;
}

export const TextAreaRoot = styled.textarea<TextAreaRootProps>`
  font-family: inherit;
  font-weight: 700;
  font-size: 1rem;
  color: var(--mb-color-text-dark);
  padding: 0.75rem;
  border: 1px solid var(--mb-color-border);
  border-radius: 0.5rem;
  background-color: ${props =>
    props.readOnly ? "var(--mb-color-bg-light)" : "var(--mb-color-bg-white)"};
  outline: none;
  text-align: inherit;

  &:focus,
  &:hover {
    border-color: var(--mb-color-brand);
    transition: border 300ms ease-in-out;
  }

  ${focusOutlineStyle("brand")};

  &:disabled {
    pointer-events: none;
    opacity: 0.4;
  }

  ${props =>
    props.hasError &&
    css`
      border-color: var(--mb-color-error);
    `};

  ${props =>
    props.fullWidth &&
    css`
      width: 100%;
    `}
`;
