import { css } from "@emotion/react";
import { color } from "metabase/lib/colors";

export const inputPadding = css`
  padding: 0.625rem 0.75rem;
`;

export const inputTypography = css`
  font-size: 0.875rem;
  font-weight: 700;
`;

export const inputFocusOutline = () => css`
  &:focus {
    border-color: ${color("brand")};
    outline: 2px solid ${color("focus")};
  }

  &:focus:not(:focus-visible) {
    outline: none;
  }
`;

export const numericInputReset = () => css`
  &::-webkit-outer-spin-button,
  &::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }

  &[type="number"] {
    -moz-appearance: textfield;
  }
`;
