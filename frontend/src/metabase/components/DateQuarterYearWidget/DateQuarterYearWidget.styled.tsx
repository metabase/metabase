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
    color: var(--mb-color-text-white);
    background-color: var(--mb-color-brand);
  }

  ${({ isSelected, theme }) =>
    isSelected &&
    css`
      color: var(--mb-color-text-white);
      background-color: ${theme.fn.themeColor("brand")};
    `}
`;
