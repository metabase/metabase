import styled, { css } from "styled-components";

import { color } from "metabase/lib/colors";

export const Container = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow-x: hidden;
  width: 100%;
`;

export const HeaderContainer = styled.header`
  background-color: white;
  border-bottom: 1px solid ${color("border")};
  position: relative;
  z-index: 2;

  ${({ isFullscreen }) =>
    isFullscreen &&
    css`
      background-color: transparent;
      border: none;
    `}

  ${({ isNightMode }) =>
    isNightMode &&
    css`
      color: ${color("text-white")};
    `}
`;
