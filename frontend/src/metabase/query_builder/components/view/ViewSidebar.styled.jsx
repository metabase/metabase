import styled, { css } from "styled-components";

export const ViewSideBarAside = styled.aside`
  background: white;
  height: 100%;
  overflow-x: hidden;
  overflow-y: auto;
  position: absolute;
  width: 355px;

  ${({ left }) =>
    left &&
    css`
      left: 0;
    `}

  ${({ right }) =>
    right &&
    css`
      right: 0;
    `}

  ${({ width }) =>
    width &&
    css`
      width: ${width}px;
    `}

`;

export const ViewSidebarContent = styled.div`
  position: absolute;
  width: 355px;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
`;
