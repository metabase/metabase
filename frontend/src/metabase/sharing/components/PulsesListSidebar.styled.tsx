import { css } from "@emotion/react";
import styled from "@emotion/styled";

import Card from "metabase/components/Card";
import { color } from "metabase/lib/colors";

export interface PulesCardProps {
  canEdit: boolean;
}

export const PulseCard = styled(Card)<PulesCardProps>`
  margin-bottom: 2rem;

  ${({ canEdit }) =>
    canEdit &&
    css`
      cursor: pointer;

      &:hover {
        background-color: ${color("brand")};
      }
    `}
`;

export const SidebarActions = styled.div`
  display: flex;
  align-items: center;
`;
