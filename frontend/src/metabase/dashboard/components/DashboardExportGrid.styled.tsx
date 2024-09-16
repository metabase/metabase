import { css } from "@emotion/react";
import styled from "@emotion/styled";

import DashboardS from "metabase/css/dashboard.module.css";

interface DashboardCardProps {
  isAnimationDisabled?: boolean;
}

export const DashboardCardContainer = styled.div<DashboardCardProps>`
  position: relative;
  z-index: 1;
  container-name: DashboardCard;
  container-type: inline-size;

  /**
  * Dashcards are positioned absolutely so each one forms a new stacking context.
  * The dashcard user is currently interacting with needs to be positioned above other dashcards
  * to make sure it's not covered by absolutely positioned children of neighboring dashcards.
  *
  * @see https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_positioned_layout/Understanding_z-index/Stacking_context
  */
  &:hover,
  &:focus-within {
    z-index: 2;
  }

  .${DashboardS.Card} {
    position: absolute;
    top: 0;
    left: 0;
    bottom: 0;
    right: 0;
    border-radius: 8px;
    border: 1px solid gray;
  }

  ${props =>
    props.isAnimationDisabled
      ? css`
          transition: none;
        `
      : null};

  @media (prefers-reduced-motion) {
    /* short duration (instead of none) to still trigger transition events */
    transition-duration: 10ms !important;
  }

  /* Google Maps widgets */
  .gm-style-mtc,
  .gm-bundled-control,
  .PinMapUpdateButton,
  .leaflet-container .leaflet-control-container {
    opacity: 0.01;
    transition: opacity 0.3s linear;
  }

  &:hover .gm-style-mtc,
  &:hover .gm-bundled-control,
  &:hover .PinMapUpdateButton,
  .leaflet-container:hover .leaflet-control-container {
    opacity: 1;
  }
`;

export const DashboardGridContainer = styled.div<{
  isFixedWidth: boolean;
}>`
  display: flex;
  align-items: center;
  justify-content: center;

  ${({ isFixedWidth }) =>
    isFixedWidth &&
    css`
      margin: 0 auto;
    `}
`;
