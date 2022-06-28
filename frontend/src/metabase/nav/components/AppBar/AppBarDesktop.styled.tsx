import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import { APP_BAR_HEIGHT } from "metabase/nav/constants";
import { LogoLink, SidebarButtonContainer } from "./AppBarLogo.styled";
import { breakpointMaxSmall } from "metabase/styled-components/theme";

export const AppBarRoot = styled.header`
  display: flex;
  align-items: center;
  height: ${APP_BAR_HEIGHT};
  background-color: ${color("bg-white")};
  border-bottom: 1px solid ${color("border")};
  z-index: 4;

  @media print {
    display: none;
  }
`;

export interface LeftContainerProps {
  isNavBarVisible?: boolean;
}

export const AppBarLeftContainer = styled.div<LeftContainerProps>`
  display: flex;
  align-items: center;

  ${SidebarButtonContainer} {
    opacity: ${props => (props.isNavBarVisible ? 0 : 1)};
  }

  &:hover {
    ${LogoLink} {
      opacity: ${props => (props.isNavBarVisible ? 0 : 1)};
      pointer-events: ${props => (props.isNavBarVisible ? "none" : "")};
    }

    ${SidebarButtonContainer} {
      opacity: ${props => (props.isNavBarVisible ? 1 : 0)};
    }
  }
`;

export const AppBarRightContainer = styled.div`
  display: flex;
  align-items: center;
`;

export interface InfoBarContainerProps {
  isNavBarOpen?: boolean;
}

export const InfoBarContainer = styled.div<InfoBarContainerProps>`
  display: flex;
  visibility: ${props => (props.isNavBarOpen ? "hidden" : "visible")};
  opacity: ${props => (props.isNavBarOpen ? 0 : 1)};
  transition: ${props =>
    props.isNavBarOpen ? `opacity 0.5s, visibility 0s` : `opacity 0.5s`};
`;
