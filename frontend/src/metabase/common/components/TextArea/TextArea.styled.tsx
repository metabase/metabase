// eslint-disable-next-line no-restricted-imports
import { css } from "@emotion/react";
// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

import { focusOutlineStyle } from "metabase/common/style/input";

interface TextAreaRootProps {
  readOnly?: boolean;
  hasError?: boolean;
  fullWidth?: boolean;
}

export const TextAreaRoot = styled.textarea<TextAreaRootProps>`
  font-family: inherit;
  font-weight: 700;
  font-size: 1rem;
  color: var(--mb-color-text-primary);
  padding: 0.75rem;
  border: 1px solid var(--mb-color-border-neutral);
  border-radius: 0.5rem;
  background-color: ${(props) =>
    props.readOnly
      ? "var(--mb-color-background_page-secondary)"
      : "var(--mb-color-background_page-primary)"};
  outline: none;
  text-align: inherit;

  &:focus,
  &:hover {
    border-color: var(--mb-color-core-brand);
    transition: border 300ms ease-in-out;
  }

  ${focusOutlineStyle("core-brand")};

  &:disabled {
    pointer-events: none;
    opacity: 0.4;
  }

  ${(props) =>
    props.hasError &&
    css`
      border-color: var(--mb-color-error);
    `};

  ${(props) =>
    props.fullWidth &&
    css`
      width: 100%;
    `}
`;
