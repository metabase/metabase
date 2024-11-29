import { css } from "@emotion/react";
import styled from "@emotion/styled";

import { SyncedParametersList } from "./SyncedParametersList";

interface ResponsiveParametersListRootProps {
  isSmallScreen: boolean;
  isShowingMobile: boolean;
}

export const ResponsiveParametersListRoot = styled.div<ResponsiveParametersListRootProps>`
  ${({ isSmallScreen, isShowingMobile }) =>
    isSmallScreen &&
    isShowingMobile &&
    css`
      width: 100%;
    `}
`;

interface ParametersListContainerProps {
  isSmallScreen: boolean;
  isShowingMobile: boolean;
}

export const ParametersListContainer = styled.div<ParametersListContainerProps>`
  background-color: var(--mb-color-bg-light);

  ${({ isSmallScreen, isShowingMobile }) =>
    isSmallScreen &&
    css`
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      border-bottom: 1px solid var(--mb-color-border);
      overflow-y: auto;
      bottom: ${isShowingMobile ? "0" : "100%"};
      padding-bottom: ${isShowingMobile ? "0.5rem" : "0"};
      opacity: ${isShowingMobile ? "1" : "0"};
      transition: opacity 250ms;

      ${StyledParametersList} {
        position: relative;
        top: ${isShowingMobile ? "0" : "15px"};
        transition: top 250ms;
      }
    `}
`;

export const StyledParametersList = styled(SyncedParametersList)`
  margin: 0 1rem;
`;
