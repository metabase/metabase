// eslint-disable-next-line no-restricted-imports
import { css } from "@emotion/react";

import { getFocusColor } from "metabase/ui/colors";

import type { InputSize } from "./types";

const inputPaddingBySize = {
  small: css`
    padding: 0.5rem 0.625rem;
  `,
  medium: css`
    padding: 0.625rem 0.75rem;
  `,
  large: css`
    padding: 0.75rem;
  `,
} as const;

export const inputPadding = (size: InputSize = "medium") =>
  inputPaddingBySize[size];

const inputTypographyBySize = {
  small: css`
    font-size: 0.875rem;
    font-weight: 700;
  `,
  medium: css`
    font-size: 0.875rem;
    font-weight: 700;
  `,
  large: css`
    font-size: 1rem;
    font-weight: 700;
  `,
} as const;

export const inputTypography = (size: InputSize = "medium") =>
  inputTypographyBySize[size];

export const focusOutlineStyle = (color: string) => css`
  &:focus {
    outline: 2px solid ${getFocusColor(color)};
  }

  &:focus:not(:focus-visible) {
    outline: none;
  }
`;
