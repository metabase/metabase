import styled from "@emotion/styled";
import { css } from "@emotion/react";
import { color } from "metabase/lib/colors";

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
`;

export const DashboardCardActionsPanel = styled.div<{
  isDashCardTabMenuOpen: boolean;
  onLeftEdge: boolean;
}>`
  padding: 0.125em 0.25em;
  position: absolute;
  background: white;
  transform: translateY(-50%);
  top: 0;
  right: 20px;
  border-radius: 8px;
  box-shadow: 0px 1px 3px rgb(0 0 0 / 13%);
  cursor: default;
  transition: opacity 200ms;
  opacity: ${({ isDashCardTabMenuOpen }) => (isDashCardTabMenuOpen ? 1 : 0)};
  pointer-events: ${({ isDashCardTabMenuOpen }) =>
    isDashCardTabMenuOpen ? "all" : "none"};
  // react-resizable covers panel, we have to override it
  z-index: 2;
  // left align on small cards on the left edge to not make the actions go out of the viewport
  @container DashboardCard (max-width: 12rem) {
    ${({ onLeftEdge }) => onLeftEdge && "right: unset;"}
    ${({ onLeftEdge }) => onLeftEdge && "left: 20px;"}
  }

  .Card:hover &,
  .Card:focus-within & {
    opacity: 1;
    pointer-events: all;
  }

  .Dash--dragging & {
    display: none;
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
  padding: 1.5rem;
`;
