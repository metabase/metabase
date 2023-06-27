import { css } from "@emotion/react";
import { styled } from "metabase/ui/utils";
import { color } from "metabase/lib/colors";
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
        color: ${color("white")};
        background-color: ${color("brand")};
      }
    `}
`;
