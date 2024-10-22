import { css } from "@emotion/react";
import styled from "@emotion/styled";

import DashboardS from "metabase/css/dashboard.module.css";
import { isEmbeddingSdk } from "metabase/env";
import type { MantineTheme } from "metabase/ui";
import { SAVING_DOM_IMAGE_CLASS } from "metabase/visualizations/lib/save-chart-image";

import { FIXED_WIDTH } from "./Dashboard/Dashboard.styled";

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

    ${({ theme }) => getDashboardCardShadowOrBorder(theme)}
  }

  .${SAVING_DOM_IMAGE_CLASS} & .${DashboardS.Card} {
    /* the renderer we use for saving to image/pdf doesn't support box-shadow
       so we replace it with a border */
    box-shadow: none;
    border: 1px solid var(--mb-color-border);
  }

  /* the renderer for saving to image/pdf does not support text overflow
     with line height in custom themes in the embedding sdk.
     this is a workaround to make sure the text is not clipped vertically */
  ${isEmbeddingSdk &&
  css`
    .${SAVING_DOM_IMAGE_CLASS} & .${DashboardS.Card} * {
      overflow: visible !important;
    }
  `};

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
      max-width: ${FIXED_WIDTH};
    `}
`;

function getDashboardCardShadowOrBorder(theme: MantineTheme) {
  const { border } = theme.other.dashboard.card;

  if (border) {
    return css`
      border: ${border};
    `;
  }

  return css`
    box-shadow: 0 1px 3px var(--mb-color-shadow);
  `;
}
