import { css } from "@emotion/react";
import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";

export const FormMessageStyled = styled.span<{
  visible?: boolean;
  hasSucceeded?: boolean;
  noPadding?: boolean;
}>`
  color: ${({ hasSucceeded }) =>
    hasSucceeded ? color("success") : color("error")};
  float: left;
  opacity: 0;
  padding-bottom: ${({ noPadding }) => (noPadding ? "" : space(2))};
  transition: none;
  width: 100%;

  ${({ visible }) =>
    visible &&
    css`
      opacity: 1;
      transition: opacity 500ms linear;
    `}
`;
