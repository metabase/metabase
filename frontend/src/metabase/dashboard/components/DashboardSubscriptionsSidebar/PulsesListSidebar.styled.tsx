// eslint-disable-next-line no-restricted-imports
import { css } from "@emotion/react";
// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";
import type { ComponentPropsWithoutRef, ComponentType } from "react";

import type { CardProps } from "metabase/ui";
import { Card } from "metabase/ui";

type PulseCardProps = CardProps &
  ComponentPropsWithoutRef<"div"> & {
    canEdit: boolean;
  };

export const PulseCard = styled(Card)<{ canEdit: boolean }>`
  margin-bottom: 2rem;

  ${({ canEdit }) =>
    canEdit &&
    css`
      cursor: pointer;

      &:hover {
        background-color: var(--mb-color-core-brand);
      }
    `}
` as unknown as ComponentType<PulseCardProps>;

export const SidebarActions = styled.div`
  display: flex;
  align-items: center;
`;
