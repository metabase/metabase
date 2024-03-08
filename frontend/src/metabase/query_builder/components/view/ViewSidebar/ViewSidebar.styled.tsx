import { css } from "@emotion/react";
import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";
import { breakpointMaxSmall } from "metabase/styled-components/theme";

export const ViewSidebarAside = styled.aside<{
  isOpen: boolean;
  side: string;
  widthProp: number;
}>`
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

          ${breakpointMaxSmall} {
            margin-left: auto;
          }
        `}

  ${({ isOpen, widthProp: width }) =>
    isOpen &&
    width &&
    css`
      width: ${width}px;
    `}
`;

export const ViewSidebarContent = styled.div<{ widthProp: number }>`
  position: absolute;
  height: 100%;

  ${({ widthProp: width }) =>
    width &&
    css`
      width: ${width}px;
    `}
`;
