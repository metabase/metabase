import { css } from "@emotion/react";
import styled from "@emotion/styled";

import Card from "metabase/components/Card";
import { color } from "metabase/lib/colors";

export interface SlackCardProps {
  isConfigured: boolean;
}

export const ChannelCard = styled(Card)<SlackCardProps>`
  ${({ isConfigured }) =>
    isConfigured &&
    css`
      cursor: pointer;

      &:hover {
        color: ${color("white")};
        background-color: ${color("brand")};
      }
    `}
`;
