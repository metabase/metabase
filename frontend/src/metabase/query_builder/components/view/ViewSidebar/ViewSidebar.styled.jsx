import styled, { css } from "styled-components";

import { color } from "metabase/lib/colors";

export const ViewSidebarAside = styled.aside`
  overflow-x: hidden;
  overflow-y: auto;
  opacity: 0;
  position: relative;
  transition: width 0.3s, opacity 0.3s;
  width: 0;

  ${({ side }) =>
    side === "left"
      ? css`
          border-right: 1px solid ${color("border")};
          left: 0;
        `
      : css`
          border-left: 1px solid ${color("border")};
          right: 0;
        `}

  ${({ isOpen, widthProp: width }) =>
    isOpen &&
    width &&
    css`
      opacity: 1;
      width: ${width}px;
    `}

  @media (prefers-reduced-motion) {
    transition: none;
  }
`;

export const ViewSidebarContent = styled.div`
  position: absolute;
  height: 100%;
  width: 100%;
`;
