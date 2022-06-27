import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import Link from "metabase/core/components/Link";
import {
  breakpointMaxSmall,
  breakpointMinSmall,
  space,
} from "metabase/styled-components/theme";
import { APP_BAR_HEIGHT } from "../../constants";

export const AppBarRoot = styled.header`
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  height: ${APP_BAR_HEIGHT};
  background-color: ${color("bg-white")};
  border-bottom: 1px solid ${color("border")};
  z-index: 4;

  @media print {
    display: none;
  }
`;

export const LogoLinkContainer = styled.div`
  position: relative;
  margin-left: ${space(2)};

  ${breakpointMaxSmall} {
    margin-left: ${space(1)};
  }
`;

export const LogoLink = styled(Link)`
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 0.375rem;
  padding: ${space(1)} ${space(2)};
  transition: opacity 0.3s;

  &:hover {
    background-color: ${color("bg-light")};
  }
`;

export const SidebarButtonContainer = styled.div`
  position: absolute;
  top: 0.625rem;
  left: 0.9375rem;
  opacity: 0;
  transition: opacity 0.3s;
`;

export interface LeftContainerProps {
  isLogoActive: boolean;
  isSearchActive: boolean;
}

export const LeftContainer = styled.div<LeftContainerProps>`
  display: flex;
  height: 100%;
  flex-direction: row;
  align-items: center;
  width: 30%;

  &:hover {
    ${LogoLink} {
      opacity: ${props => (props.isLogoActive ? 1 : 0)};
      pointer-events: ${props => (props.isLogoActive ? "" : "none")};
    }

    ${SidebarButtonContainer} {
      opacity: ${props => (props.isLogoActive ? 0 : 1)};
    }
  }

  ${breakpointMaxSmall} {
    width: ${props =>
      props.isSearchActive ? "5rem" : "calc(100% - 3.75rem);"};

    ${LogoLink} {
      opacity: 0;
      pointer-events: none;
    }

    ${SidebarButtonContainer} {
      opacity: 1;
    }
  }
`;

export const MiddleContainer = styled.div`
  display: none;
  justify-content: center;
  width: 5rem;

  ${breakpointMaxSmall} {
    display: flex;
  }

  ${LogoLink} {
    position: relative;
    padding-left: 0.5rem;
    margin-left: 0;
  }
`;

export const RightContainer = styled.div`
  display: flex;
  height: 100%;
  flex-direction: row;
  align-items: center;
  width: 30%;
  justify-content: flex-end;

  ${breakpointMaxSmall} {
    width: calc(100% - 3.75rem);
  }
`;

export const SearchBarContainer = styled.div`
  display: flex;
  align-items: center;
  margin-right: 1rem;

  ${breakpointMaxSmall} {
    width: 100%;
  }
`;

export const SearchBarContent = styled.div`
  ${breakpointMaxSmall} {
    width: 100%;
  }

  ${breakpointMinSmall} {
    position: relative;
    width: 28.75rem;
  }
`;

interface CollectionBreadcrumbsContainerProps {
  isVisible: boolean;
}

export const CollectionBreadcrumbsContainer = styled.div<
  CollectionBreadcrumbsContainerProps
>`
  display: flex;
  visibility: ${props => (props.isVisible ? "visible" : "hidden")};
  opacity: ${props => (props.isVisible ? 1 : 0)};
  transition: ${props =>
    !props.isVisible ? `opacity 0.5s, visibility 0s 0.5s` : `opacity 0.5s`};
`;
