import { css } from "@emotion/react";
import { getFocusColor } from "metabase/lib/colors";

export const inputPadding = css`
  padding: 0.625rem 0.75rem;
`;

export const inputTypography = css`
  font-size: 0.875rem;
  font-weight: 700;
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

export const focusOutlineStyle = (color: string) => css`
  &:focus {
    outline: 2px solid ${getFocusColor(color)};
  }

  &:focus:not(:focus-visible) {
    outline: none;
  }
`;
