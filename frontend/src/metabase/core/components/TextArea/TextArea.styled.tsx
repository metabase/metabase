import { css } from "@emotion/react";
import styled from "@emotion/styled";

import { focusOutlineStyle } from "metabase/core/style/input";
import { color } from "metabase/lib/colors";

export interface TextAreaRootProps {
  readOnly?: boolean;
  hasError?: boolean;
  fullWidth?: boolean;
}

export const TextAreaRoot = styled.textarea<TextAreaRootProps>`
  font-family: inherit;
  font-weight: 700;
  font-size: 1rem;
  color: ${color("text-dark")};
  padding: 0.75rem;
  border: 1px solid ${color("border")};
  border-radius: 0.5rem;
  background-color: ${props => color(props.readOnly ? "bg-light" : "bg-white")};
  outline: none;
  text-align: inherit;

  &:focus,
  &:hover {
    border-color: ${color("brand")};
    transition: border 300ms ease-in-out;
  }
  ${css`
    ${focusOutlineStyle("brand")}
  `};

  &:disabled {
    pointer-events: none;
    opacity: 0.4;
  }

  ${props =>
    props.hasError &&
    css`
      border-color: ${color("error")};
    `};

  ${props =>
    props.fullWidth &&
    css`
      width: 100%;
    `}
`;
