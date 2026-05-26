// eslint-disable-next-line no-restricted-imports
import { css } from "@emotion/react";
// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

import { Card } from "metabase/common/components/Card";

interface PulesCardProps {
  canEdit: boolean;
}

export const PulseCard = styled(Card)<PulesCardProps>`
  margin-bottom: 2rem;

  ${({ canEdit }) =>
    canEdit &&
    css`
      cursor: pointer;

      &:hover {
        background-color: var(--mb-color-brand);
      }
    `}
`;

export const SidebarActions = styled.div`
  display: flex;
  align-items: center;
`;
