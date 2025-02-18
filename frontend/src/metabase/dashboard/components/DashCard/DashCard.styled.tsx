import { type Theme, css } from "@emotion/react";
import styled from "@emotion/styled";

import { getDashboardBodyBgColor } from "metabase/dashboard/components/Dashboard/Dashboard.styled";

interface DashCardRootProps {
  isNightMode: boolean;
  isUsuallySlow: boolean;
  hasHiddenBackground: boolean;
  shouldForceHiddenBackground: boolean;
}

const getRootSlowCardStyle = (theme: Theme) => css`
  border-color: ${theme.fn.themeColor("accent4")};
`;

export const DashCardRoot = styled.div<DashCardRootProps>`
  background-color: var(--mb-color-bg-dashboard-card);
  scroll-margin: 6px 0;

  ${({ isNightMode }) =>
    isNightMode &&
    css`
      border-color: var(--mb-color-bg-night);
      background-color: var(--mb-color-bg-night);
    `}
  ${({ isUsuallySlow, theme }) => isUsuallySlow && getRootSlowCardStyle(theme)}
  ${({ hasHiddenBackground }) =>
    hasHiddenBackground &&
    css`
      border: 0 !important;
      background: transparent !important;
      box-shadow: none !important;
    `}

  ${({ shouldForceHiddenBackground }) =>
    shouldForceHiddenBackground &&
    css`
      background: ${getDashboardBodyBgColor(false)};
      box-shadow: none !important;
    `}
`;
