import styled, { css } from "styled-components";

export const ViewSidebarAside = styled.aside`
  overflow-x: hidden;
  overflow-y: auto;
  opacity: 0;
  position: relative;
  transition: width .3s, opacity .3s;
  width: 0;

  ${({ left }) =>
    left &&
    css`
      border-right: 1px solid #f0f0f0;
      left: 0;
    `}

  ${({ right }) =>
    right &&
    css`
      border-left: 1px solid #f0f0f0;
      right: 0;
    `}

  ${({ isOpen, widthProp: width }) =>
    isOpen &&
    width &&
    css`
      opacity: 1;
      width: ${width}px;
    `}
`;

export const ViewSidebarContent = styled.div`
  position: absolute;
  height: 100%;
  width: 100%;
`;
