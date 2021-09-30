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
  transition: transform 0.4s, opacity 0.4s;
  z-index: 2;

  ${({ isOpen }) =>
    isOpen &&
    css`
      opacity: 1;
      transform: translateY(0);
    `}
`;
