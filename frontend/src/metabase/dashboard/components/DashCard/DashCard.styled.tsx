import { css } from "@emotion/react";
import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";
import { SAVING_DOM_IMAGE_CLASS } from "metabase/visualizations/lib/save-chart-image";

export interface DashCardRootProps {
  isNightMode: boolean;
  isUsuallySlow: boolean;
  hasHiddenBackground: boolean;
  shouldForceHiddenBackground: boolean;
}

const rootNightModeStyle = css`
  border-color: ${color("bg-night")};
  background-color: ${color("bg-night")};
`;

const rootSlowCardStyle = css`
  border-color: ${color("accent4")};
`;

const rootTransparentBackgroundStyle = css`
  border: 0 !important;
  background: transparent !important;
  box-shadow: none !important;
`;

const hiddenBackgroundStyle = css`
  background: ${color("bg-light")};
  box-shadow: none !important;
`;

export const DashCardRoot = styled.div<DashCardRootProps>`
  background-color: ${color("white")};

  ${({ isNightMode }) => isNightMode && rootNightModeStyle}
  ${({ isUsuallySlow }) => isUsuallySlow && rootSlowCardStyle}
  ${({ hasHiddenBackground }) =>
    hasHiddenBackground && rootTransparentBackgroundStyle}

  ${({ shouldForceHiddenBackground }) =>
    shouldForceHiddenBackground && hiddenBackgroundStyle}

  &.${SAVING_DOM_IMAGE_CLASS} {
    border-radius: 0;
    border: none !important;
  }
`;

export const VirtualDashCardOverlayRoot = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
`;

export const VirtualDashCardOverlayText = styled.h4`
  color: ${color("text-medium")};
  padding: 1rem;
`;
