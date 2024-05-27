import { css } from "@emotion/react";
import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";

export interface QuarterRootProps {
  isSelected: boolean;
}

export const QuarterRoot = styled.li<QuarterRootProps>`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 75px;
  height: 75px;
  cursor: pointer;

  &:hover {
    color: ${() => color("white")};
    background-color: ${() => color("brand")};
  }

  ${({ isSelected, theme }) =>
    isSelected &&
    css`
      color: ${theme.fn.themeColor("white")};
      background-color: ${theme.fn.themeColor("brand")};
    `}
`;
