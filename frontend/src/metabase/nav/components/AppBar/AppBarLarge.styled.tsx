import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import { APP_BAR_HEIGHT } from "metabase/nav/constants";
import { LogoLink } from "./AppBarLogo.styled";
import { SidebarButton } from "./AppBarToggle.styled";

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
  isNavBarVisible?: boolean;
}

export const AppBarLeftContainer = styled.div<AppBarLeftContainerProps>`
  display: flex;
  flex: 1 1 auto;
  align-items: center;
  min-width: 5rem;

  ${SidebarButton} {
    opacity: ${props => (props.isNavBarVisible ? 0 : 1)};
  }

  &:hover {
    ${LogoLink} {
      opacity: ${props => (props.isNavBarVisible ? 0 : 1)};
      pointer-events: ${props => (props.isNavBarVisible ? "none" : "")};
    }

    ${SidebarButton} {
      opacity: ${props => (props.isNavBarVisible ? 1 : 0)};
    }
  }
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
