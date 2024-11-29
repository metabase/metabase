import { css } from "@emotion/react";
import styled from "@emotion/styled";

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
          border-right: ${isOpen ? "1px solid var(--mb-color-border)" : "none"};
          left: 0;
        `
      : css`
          border-left: ${isOpen ? "1px solid var(--mb-color-border)" : "none"};
          right: 0;

          @media screen and (max-width: 40em) {
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
