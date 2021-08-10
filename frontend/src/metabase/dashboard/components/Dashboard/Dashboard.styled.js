import styled, { css } from "styled-components";

import { color } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";

import { FullWidthContainer } from "metabase/styled-components/layout/FullWidthContainer";

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

export const ParametersAndCardsContainer = styled.div`
  flex: auto;
  overflow-x: hidden;
`;

export const ParametersWidgetContainer = styled(FullWidthContainer)`
  align-items: flex-start;
  background-color: ${color("bg-light")};
  display: flex;
  flex-direction: column;
  padding-top: ${space(2)};
  padding-bottom: ${space(1)};
`;
