import { css } from "@emotion/react";
import styled from "@emotion/styled";

import Card from "metabase/components/Card";

export interface SlackCardProps {
  isConfigured: boolean;
}

export const ChannelCard = styled(Card)<SlackCardProps>`
  ${({ isConfigured }) =>
    isConfigured &&
    css`
      cursor: pointer;

      &:hover {
        color: var(--mb-color-text-white);
        background-color: var(--mb-color-brand);
      }
    `}
`;
