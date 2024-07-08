import isPropValid from "@emotion/is-prop-valid";
import { css } from "@emotion/react";
import styled from "@emotion/styled";

import DashboardS from "metabase/css/dashboard.module.css";
import { color } from "metabase/lib/colors";

type DashCardActionsPanelContainerProps = {
  isDashCardTabMenuOpen: boolean;
  onLeftEdge: boolean;
};

function shouldForwardProp(propName: string) {
  return (
    isPropValid(propName) &&
    propName !== "isDashCardTabMenuOpen" &&
    propName !== "onLeftEdge"
  );
}

export const DashCardActionsPanelContainer = styled("div", {
  shouldForwardProp,
})<DashCardActionsPanelContainerProps>`
  padding: 0.125em 0.25em;
  position: absolute;
  background: white;
  transform: translateY(-50%);
  top: 0;
  right: 20px;
  border-radius: 8px;
  box-shadow: 0 1px 3px rgb(0 0 0 / 13%);
  cursor: default;
  transition: opacity 200ms;
  opacity: ${({ isDashCardTabMenuOpen }) => (isDashCardTabMenuOpen ? 1 : 0)};
  pointer-events: ${({ isDashCardTabMenuOpen }) =>
    isDashCardTabMenuOpen ? "all" : "none"};

  /* react-resizable covers panel, we have to override it */
  z-index: 2;

  /* left align on small cards on the left edge to not make the actions go out of the viewport */
  ${({ onLeftEdge }) =>
    onLeftEdge &&
    css`
      @container DashboardCard (max-width: 12rem) {
        right: unset;
        left: 20px;
      }
    `}

  .${DashboardS.Card}:hover &,
  .${DashboardS.Card}:focus-within & {
    opacity: 1;
    pointer-events: all;
  }

  .${DashboardS.DashDragging} & {
    display: none;
  }
`;

export const DashCardActionButtonsContainer = styled.span`
  display: flex;
  align-items: center;
  color: ${color("text-medium")};
  line-height: 1px;
  gap: 0.5rem;
`;
