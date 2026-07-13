// eslint-disable-next-line no-restricted-imports
import { css } from "@emotion/react";

import { getFocusColor } from "metabase/ui/colors";

export const focusOutlineStyle = (color: string) => css`
  &:focus {
    outline: 2px solid ${getFocusColor(color)};
  }

  &:focus:not(:focus-visible) {
    outline: none;
  }
`;
