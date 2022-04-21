import styled from "@emotion/styled";
import { css } from "@emotion/react";

import { color } from "metabase/lib/colors";

export const ViewSidebarAside = styled.aside`
  overflow-x: hidden;
  overflow-y: auto;
  position: relative;
  width: 0;

  ${({ isOpen, side }) =>
    side === "left"
      ? css`
          border-right: ${isOpen ? `1px solid ${color("border")}` : "none"};
          left: 0;
        `
      : css`
          border-left: ${isOpen ? `1px solid ${color("border")}` : "none"};
          right: 0;
        `}

  ${({ isOpen, widthProp: width }) =>
    isOpen &&
    width &&
    css`
      width: ${width}px;
    `}
`;

export const ViewSidebarContent = styled.div`
  position: absolute;
  height: 100%;

  ${({ widthProp: width }) =>
    width &&
    css`
      width: ${width}px;
    `}
`;
