import styled, { css } from "styled-components";

import { color } from "metabase/lib/colors";

export const NotebookContainer = styled.div`
  background: white;
  border-top: 1px solid ${color("border")};
  bottom: 0;
  left: 0;
  opacity: 0;
  overflow-y: auto;
  position: absolute;
  right: 0;
  top: 0;
  transform: translateY(-100%);
  z-index: 2;

  ${({ transitionTime }) =>
    css`
      transition: transform ${transitionTime}ms, opacity ${transitionTime}ms;
    `}

  ${({ isOpen }) =>
    isOpen &&
    css`
      opacity: 1;
      transform: translateY(0);
    `}

  @media (prefers-reduced-motion) {
    transition: none;
  }
`;
