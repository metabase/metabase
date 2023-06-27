import { css } from "@emotion/react";
import { styled } from "metabase/ui/utils";

interface DashboardCardProps {
  isAnimationDisabled?: boolean;
}

export const DashboardCard = styled.div<DashboardCardProps>`
  ${props =>
    props.isAnimationDisabled
      ? css`
          transition: none;
        `
      : null};
`;
