import { css } from "@emotion/react";
import styled from "@emotion/styled";

import Card from "metabase/components/Card";

export interface PulesCardProps {
  canEdit: boolean;
}

export const PulseCard = styled(Card)<PulesCardProps>`
  margin-bottom: 2rem;

  ${({ canEdit, theme }) =>
    canEdit &&
    css`
      cursor: pointer;

      &:hover {
        background-color: ${theme.fn.themeColor("brand")};
      }
    `}
`;

export const SidebarActions = styled.div`
  display: flex;
  align-items: center;
`;
