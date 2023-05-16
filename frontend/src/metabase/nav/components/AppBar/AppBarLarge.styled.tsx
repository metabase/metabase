import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import { APP_BAR_HEIGHT } from "metabase/nav/constants";

interface AppBarRootProps {
  isNavBarOpen?: boolean;
}

export const AppBarRoot = styled.div<AppBarRootProps>`
  display: flex;
  align-items: center;
  gap: 1rem;
  height: ${APP_BAR_HEIGHT};
  padding: 0 1rem;
  border-bottom: 1px solid
    ${props => (props.isNavBarOpen ? color("border") : "transparent")};
  background-color: ${color("bg-white")};
  transition: border-bottom-color 200ms ease;
`;

export interface AppBarLeftContainerProps {
  isNavBarEnabled?: boolean;
  isLogoVisible?: boolean;
}

export const AppBarLeftContainer = styled.div<AppBarLeftContainerProps>`
  display: flex;
  flex: 1 1 auto;
  align-items: center;
  min-width: 5rem;

  padding-left: ${({ isLogoVisible, isNavBarEnabled }) =>
    !isLogoVisible && !isNavBarEnabled && "1rem"};
`;

export const AppBarRightContainer = styled.div`
  display: flex;
  flex: 1 1 auto;
  align-items: center;
  gap: 1rem;
  max-width: 32.5rem;
  justify-content: end;
`;

export interface AppBarInfoContainerProps {
  isVisible?: boolean;
}

export const AppBarInfoContainer = styled.div<AppBarInfoContainerProps>`
  display: flex;
  min-width: 0;
  opacity: ${props => (props.isVisible ? 1 : 0)};
  visibility: ${props => (props.isVisible ? "visible" : "hidden")};
  transition: ${props =>
    props.isVisible ? `opacity 0.5s` : `opacity 0.5s, visibility 0s`};
`;

export const AppBarProfileLinkContainer = styled.div`
  color: ${color("text-light")};
`;
