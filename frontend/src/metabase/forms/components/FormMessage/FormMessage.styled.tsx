// eslint-disable-next-line no-restricted-imports
import { css } from "@emotion/react";
// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

import { color } from "metabase/ui/utils/colors";

export const FormMessageStyled = styled.span<{
  visible?: boolean;
  hasSucceeded?: boolean;
  noPadding?: boolean;
}>`
  color: ${({ hasSucceeded }) =>
    hasSucceeded ? "var(--mb-color-success)" : color("error")};
  float: left;
  opacity: 0;
  padding-bottom: ${({ noPadding }) =>
    noPadding ? "" : "var(--mantine-spacing-md)"};
  transition: none;
  width: 100%;

  ${({ visible }) =>
    visible &&
    css`
      opacity: 1;
      transition: opacity 500ms linear;
    `}
`;
