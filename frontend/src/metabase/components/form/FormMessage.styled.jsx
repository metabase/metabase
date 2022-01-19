import styled, { css } from "styled-components";

import { space } from "metabase/styled-components/theme";
import { color } from "metabase/lib/colors";

export const FormMessageStyled = styled.span`
  color: ${({ hasSucceeded }) =>
    hasSucceeded ? color("success") : color("error")};
  float: left;
  opacity: 0;
  padding-bottom: ${space(3)};
  transition: none;

  ${({ visible }) =>
    visible &&
    css`
      opacity: 1;
      transition: opacity 500ms linear;
    `}
`;
