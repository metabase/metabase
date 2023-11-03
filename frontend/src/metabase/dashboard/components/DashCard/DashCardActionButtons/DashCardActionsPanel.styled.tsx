import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";

export const DashCardActionsPanelContainer = styled.div<{
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
  @container (max-width: 12rem) {
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

export const DashCardActionButtonsContainer = styled.span`
  display: flex;
  align-items: center;
  color: ${color("text-medium")};
  line-height: 1px;
  gap: 0.5rem;
`;
