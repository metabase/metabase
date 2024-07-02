import { css, type Theme } from "@emotion/react";
import styled from "@emotion/styled";

import { SAVING_DOM_IMAGE_CLASS } from "metabase/visualizations/lib/save-chart-image";

export interface DashCardRootProps {
  isNightMode: boolean;
  isUsuallySlow: boolean;
  hasHiddenBackground: boolean;
  shouldForceHiddenBackground: boolean;
}

const rootNightModeStyle = css`
  border-color: var(--mb-color-bg-night);
  background-color: var(--mb-color-bg-night);
`;

const getRootSlowCardStyle = (theme: Theme) => css`
  border-color: ${theme.fn.themeColor("accent4")};
`;

const rootTransparentBackgroundStyle = css`
  border: 0 !important;
  background: transparent !important;
  box-shadow: none !important;
`;

const hiddenBackgroundStyle = css`
  background: var(--mb-color-bg-light);
  box-shadow: none !important;
`;

export const DashCardRoot = styled.div<DashCardRootProps>`
  background-color: var(--mb-color-bg-dashboard-card);

  ${({ isNightMode }) => isNightMode && rootNightModeStyle}
  ${({ isUsuallySlow, theme }) => isUsuallySlow && getRootSlowCardStyle(theme)}
  ${({ hasHiddenBackground }) =>
    hasHiddenBackground && rootTransparentBackgroundStyle}

  ${({ shouldForceHiddenBackground }) =>
    shouldForceHiddenBackground && hiddenBackgroundStyle}

  &.${SAVING_DOM_IMAGE_CLASS} {
    border-radius: 0;
    border: "none";
  }
`;

export const VirtualDashCardOverlayRoot = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
`;

export const VirtualDashCardOverlayText = styled.h4`
  color: var(--mb-color-text-medium);
  padding: 1rem;
`;
