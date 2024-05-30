import { css } from "@emotion/react";
import styled from "@emotion/styled";

import Card from "metabase/components/Card";

export interface SlackCardProps {
  isConfigured: boolean;
}

export const ChannelCard = styled(Card)<SlackCardProps>`
  ${({ isConfigured, theme }) =>
    isConfigured &&
    css`
      cursor: pointer;

      &:hover {
        color: var(--mb-color-text-white);
        background-color: ${theme.fn.themeColor("brand")};
      }
    `}
`;
