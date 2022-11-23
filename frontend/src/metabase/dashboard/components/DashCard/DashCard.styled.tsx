import styled from "@emotion/styled";
import { css } from "@emotion/react";
import { color } from "metabase/lib/colors";

export interface DashCardRootProps {
  isNightMode: boolean;
  isUsuallySlow: boolean;
}

export const DashCardRoot = styled.div<DashCardRootProps>`
  background-color: ${color("white")};

  ${({ isNightMode }) =>
    isNightMode &&
    css`
      border-color: ${color("bg-night")};
      background-color: ${color("bg-night")};
    `}

  ${({ isUsuallySlow }) =>
    isUsuallySlow &&
    css`
      border-color: ${color("accent4")};
    `}
`;

export const DashboardCardActionsPanel = styled.div`
  padding: 0.125em 0.25em;
  position: absolute;
  background: white;
  transform: translateY(-50%);
  top: 0;
  right: 20px;
  border-radius: 8px;
  box-shadow: 0px 1px 3px rgb(0 0 0 / 13%);
  z-index: 3;
  cursor: default;
  transition: opacity 200ms;
  opacity: 0;
  pointer-events: none;

  .Card:hover & {
    opacity: 1;
    pointer-events: all;
  }

  .Dash--dragging & {
    display: none;
  }
`;
